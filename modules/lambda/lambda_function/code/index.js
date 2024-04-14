/*
Account vulnerabilities found by candidate-5:
 - Found missing MFA of root user and all users
 - EC2 instance security groups as inbound and outbound trafic are open for all users
 - Missing to add users to security group
 - Add permissions boundaries for IAM entities
 - EBS volumes are not encrypted
*/

const { DynamoDBDocument, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDB, DescribeTableCommand, CreateTableCommand } = require("@aws-sdk/client-dynamodb");
const { EC2, DescribeSubnetsCommand, DescribeVolumesCommand, DescribeSecurityGroupsCommand, DescribeRegionsCommand, DescribeRouteTablesCommand } = require("@aws-sdk/client-ec2");
const { S3, ListBucketsCommand, GetBucketAclCommand, GetBucketPolicyStatusCommand } = require("@aws-sdk/client-s3");
const { IAM, ListAttachedRolePoliciesCommand, GetRoleCommand, ListUsersCommand, ListGroupsForUserCommand, CreateAccessKeyCommand, GetUserCommand, ListRolesCommand } = require("@aws-sdk/client-iam");
const { Lambda, ListFunctionsCommand } = require("@aws-sdk/client-lambda");
const { createHash } = require('crypto');

// Environment Variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "candidate-5-inventory";

// Initialize AWS SDK clients
const dynamoDb = DynamoDBDocument.from(new DynamoDB({}));
const ec2 = new EC2();
const s3 = new S3();
const lambda = new Lambda();
const iam = new IAM();

/**
 * AWS Lambda Handler function to process incoming requests
 * @param {Object} event - The AWS Lambda event object containing request data
 * @returns {Object} Returns a response object with status code and body
 */
exports.handler = async (event) => {
    try {
        /* Example of Event JSON
            {
            "body": "{\"userName\": \"candidate-5\", \"createAccessKey\": true, \"issues\": [\"EC2 instance security groups as inbound and outbound traffic are open for all users\", \"Found missing MFA of root user and all users\", \"Add users to security group\", \"Add permissions boundaries for IAM entities\", \"EBS volumes are not encrypted\"]}"
            }
        */
        console.log("Event sent was: ", event.body);
        const { userName, createAccessKey, issues } = JSON.parse(event.body);
        const inventoryTableName = `${userName}-inventory`;
        const userIssuesTableName = `${userName}-issues-reported-by-user`;

        const tableNames = [inventoryTableName, userIssuesTableName];
        const tableExistsPromises = tableNames.map(tableName =>
            dynamoDb.send(new DescribeTableCommand({ TableName: tableName })).then(() => true).catch(() => false)
        );
        const tableExistsResults = await Promise.all(tableExistsPromises);

        const tablesToCreate = tableNames.filter((_, i) => !tableExistsResults[i]);
        if (tablesToCreate.length > 0) {
            console.log(`Will attempt to create tables: ${tablesToCreate.join(', ')}`);
            for (const tableName of tablesToCreate) {
                await checkAndCreateTable(tableName);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (issues && issues.length) {
            await handleIssues(issues, userName, userIssuesTableName);
        }

        let accessKeyData = null;
        if (createAccessKey) {
            accessKeyData = await createAccessKeyForUser(userName);
        }

        const assets = await collectAssets();
        await storeAssetsInDynamoDB(assets, DYNAMODB_TABLE_NAME);
        
        const message = accessKeyData
            ? `User ${userName} has an access key created. Also scanned the AWS account and added ${assets.length} assets to DynamoDB.`
            : `Scanned the AWS account and added ${assets.length} assets to DynamoDB.`;

        return {
            statusCode: 200,
            body: JSON.stringify({ message, accessKeyData })
        };
    } catch (error) {
        console.error("Error in handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: `Handler failure: ${error.message}`
            })
        };
    }    
};

/**
 * Lists all AWS regions available via the EC2 client
 * @returns {Promise<Array<string>>} A promise that resolves to an array of region names
 */
async function listAllRegions() {
    const regionsData = await ec2.send(new DescribeRegionsCommand({}));
    return regionsData.Regions.map(region => region.RegionName);
}

/**
 * Ensures specified DynamoDB tables are created
 * @param {Array<string>} tableNames - Array of table names to check and create if necessary
 */
async function checkAndCreateTable(tableName) {
    try {
        const command = new DescribeTableCommand({ TableName: tableName });
        const response = await dynamoDb.send(command);
        console.log("Table exists:", response.Table.TableName);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            const createParams = {
                TableName: tableName,
                KeySchema: [
                    { AttributeName: "PK", KeyType: "HASH" },  // Partition key
                    { AttributeName: "SK", KeyType: "RANGE" }  // Sort key
                ],
                AttributeDefinitions: [
                    { AttributeName: "PK", AttributeType: "S" },
                    { AttributeName: "SK", AttributeType: "S" }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 10,
                    WriteCapacityUnits: 10
                },
                PointInTimeRecoverySpecification: {
                    PointInTimeRecoveryEnabled: true
                }
            };
            const createCommand = new CreateTableCommand(createParams);
            try {
                const createResponse = await dynamoDb.send(createCommand);
                console.log("Table created:", createResponse.TableDescription.TableName);
            } catch (createError) {
                console.error("Error creating table:", createError);
                throw createError;
            }
        } else {
            console.error("Error checking table:", error);
            throw error;
        }
    }
}

/**
 * Handles and logs issues reported by users to DynamoDB
 * @param {Array<string>} issues - Array of issue strings reported by the user
 * @param {string} userName - Username of the user reporting the issues
 * @param {string} tableName - DynamoDB table name to store the issues
 */
async function handleIssues(issues, userName, userIssuesTableName) {
    const tableName = userIssuesTableName;
    const chunks = chunkArray(issues, 25); // DynamoDB batch write limit is 25
    for (const chunk of chunks) {
        const putRequests = chunk.map(issue => ({
            PutRequest: {
                Item: {
                    PK: userName,
                    SK: createHash('md5').update(issue).digest('hex'),
                    IssueReported: issue
                }
            }
        }));

        const batchWriteParams = {
            RequestItems: { [tableName]: putRequests }
        };
        try {
            await dynamoDb.send(new BatchWriteCommand(batchWriteParams));            
        } catch (error) {
            console.error("Failed to write batch to DynamoDB:", error);
            throw error;
        }
    }
}

/**
 * Creates an access key for the specified user if possible
 * @param {string} userName - Username of the user to create an access key for
 * @returns {Promise<Object|null>} The created access key data or null if limit reached
 */
async function createAccessKeyForUser(userName) {
    const createAccessKeyParams = { UserName: userName };
    try {
        return await iam.send(new CreateAccessKeyCommand(createAccessKeyParams));
    } catch (error) {
        if (error.code === 'LimitExceededException' && error.message.includes('Access Keys Per User Quota')) {
            console.error(`User ${userName} cannot have another access key created, they have reached the limit of 2 access keys per user.`);
            return null;
        }
    }
}

/**
 * Helper function to divide an array into chunks of specified size
 * @param {Array<any>} array - Array to be chunked
 * @param {number} chunkSize - Size of each chunk
 * @returns {Array<Array<any>>} An array of arrays, where each sub-array is a chunk of the original array
 */
function chunkArray(array, chunkSize) {
    const result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize));
    }
    return result;
}

/**
 * Lists users from IAM with risk assessments
 * @returns {Promise<Array<Object>>} An array of user objects with risk details
 */
async function listUsersWithRisk() {
    const { Users } = await iam.send(new ListUsersCommand({}));
    const usersWithRisk = await Promise.all(Users.map(async (user) => {
        const userDetails = await iam.send(new GetUserCommand({ UserName: user.UserName }));
        let risk = "None";
        let riskDetail = "None";

        if (!userDetails.User.MFAEnabled) {
            risk = "High";
            riskDetail = "No MFA enabled";
        }

        if (!userDetails.User.PermissionsBoundary) {
            risk = "Medium";
            riskDetail = "No permissions boundary set";
        }

        return {
            ResourceId: `${user.UserName}_${userDetails.User.UserId}_user`,
            ResourceType: "IAMUser",
            UserName: user.UserName,
            Risk: risk,
            RiskDetail: riskDetail
        };
    }));

    return usersWithRisk;
}

/**
 * Lists roles from IAM with detailed risk assessments.
 * @returns {Promise<Array<Object>>} An array of role objects with risk details
 */
async function listRolesWithRisk() {
    const { Roles } = await iam.send(new ListRolesCommand({}));
    const rolesWithRisk = await Promise.all(Roles.map(async (role) => {
        const roleDetails = await iam.send(new GetRoleCommand({ RoleName: role.RoleName }));
        const { AttachedPolicies } = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: role.RoleName }));
        let risk = "None";
        let riskDetail = "None";

        if (!roleDetails.Role.PermissionsBoundary) {
            risk = "Medium";
            riskDetail = "No permissions boundary set";
        }

        for (const policy of AttachedPolicies) {
            if (policy.PolicyName.includes("Admin")) {
                risk = "High";
                riskDetail = "Role has administrative policy";
            }
        }

        return {
            ResourceId: `${role.RoleName}_${roleDetails.Role.RoleId}`,
            ResourceType: "IAMRole",
            RoleName: role.RoleName,
            Risk: risk,
            RiskDetail: riskDetail
        };
    }));

    return rolesWithRisk;
}

/**
 * Collects asset data from various AWS services and prepares it for storage
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of asset data objects
 */
async function collectAssets() {
    const users = await listUsersWithRisk();
    const roles = await listRolesWithRisk();
    const ec2Instances = await listEC2Instances();
    const ebsVolumes = await listEBSVolumes();
    const s3Buckets = await listS3Buckets();
    const lambdaFunctions = await listLambdaFunctions();
    const subnets = await listSubnets();
    const securityGroups = await listSecurityGroups();

    // Ensure every asset includes a PK and SK
    const allAssets = [...users, ...roles, ...ec2Instances, ...ebsVolumes, ...s3Buckets, ...lambdaFunctions, ...subnets, ...securityGroups].map(asset => {
        if (!asset.PK || !asset.SK) {
            // Generate PK or SK if missing, using ResourceId or another unique identifier
            asset.PK = asset.PK || asset.ResourceId;
            asset.SK = asset.SK || createHash('md5').update(JSON.stringify(asset)).digest('hex');
        }
        return asset;
    });

    return allAssets;
}

/**
 * Stores collected assets into DynamoDB.
 * @param {Array<Object>} assets The assets to be stored.
 * @param {string} tableName The name of the DynamoDB table.
 * @returns {Promise<void>}
 */
async function storeAssetsInDynamoDB(assets, tableName) {
    const filteredAssets = assets.filter(asset => asset.ResourceId && asset.PK);
    const writeOperations = filteredAssets.map(asset => dynamoDb.put({
        TableName: tableName,
        Item: asset
    }));
    try {
        await Promise.all(writeOperations);
    } catch (error) {
        console.error("Failed to write assets to DynamoDB:", error);
        throw error;
    }
}

/**
 * Lists EC2 instances across all regions with a risk assessment based on security settings.
 * @returns {Promise<Array<Object>>} List of EC2 instances with risk details.
 */
async function listEC2Instances() {
    const regions = await listAllRegions();
    let allInstances = [];

    for (const region of regions) {
        const ec2Regional = new EC2({ region });
        const data = await ec2Regional.describeInstances({});
        const instances = data.Reservations.flatMap(reservation =>
            reservation.Instances.map(instance => ({
                ResourceId: `${instance.InstanceId}_${region}`,
                ResourceType: "EC2Instance",
                Region: region,
                InstanceType: instance.InstanceType,
                LaunchTime: instance.LaunchTime.toISOString().replace(/T/, ' ').replace(/\..+/, ''),
                State: instance.State.Name,
                Tags: JSON.stringify(instance.Tags.reduce((acc, tag) => ({...acc, [tag.Key]: tag.Value}), {}))
            }))
        );
        allInstances = allInstances.concat(instances);
    }

    return allInstances;
}

async function listRegions() {
    const command = new DescribeRegionsCommand({});
    const data = await ec2.send(command);
    return data.Regions.map(region => region.RegionName);
}

async function assessS3Risk(bucketName) {
    if (!bucketName) {
        throw new Error("Bucket name is required");
    }

    try {
        const [acl, policyStatus] = await getBucketDetails(bucketName);
        return evaluateBucketRisk(acl, policyStatus);
    } catch (error) {
        console.error(`Error assessing risk for bucket ${bucketName}: ${error.message}`);
        return {
            Risk: "Unknown",
            RiskDetail: "Error occurred during risk assessment"
        };
    }
}

async function getBucketDetails(bucketName) {
    return Promise.all([
        s3.send(new GetBucketAclCommand({ Bucket: bucketName })),
        s3.send(new GetBucketPolicyStatusCommand({ Bucket: bucketName })).catch(() => ({ PolicyStatus: { IsPublic: false }}))
    ]);
}

function evaluateBucketRisk(acl, policyStatus) {
    const isPublicAccess = acl.Grants.some(grant =>
        grant.Grantee.Type === "Group" && grant.Grantee.URI?.includes("AllUsers")
    );
    const isPolicyPublic = policyStatus.PolicyStatus?.IsPublic;

    if (isPublicAccess || isPolicyPublic) {
        return {
            Risk: "High",
            RiskDetail: "Bucket is open to the public"
        };
    } else if (policyStatus.NoSuchBucketPolicy) {
        return {
            Risk: "Medium",
            RiskDetail: "No bucket policy is attached to the bucket, potential misconfiguration"
        };
    } else {
        return {
            Risk: "Low",
            RiskDetail: "Bucket access is restricted"
        };
    }
}

/**
 * Lists S3 buckets and evaluates their security posture.
 * @returns {Promise<Array<Object>>} List of S3 buckets with their associated risk.
 */
async function listS3Buckets() {
    const command = new ListBucketsCommand({});
    try {
        const data = await s3.send(command);
        const buckets = data.Buckets;

        const bucketsWithRisk = await Promise.all(buckets.map(async (bucket) => {
            try {
                const { Risk, RiskDetail } = await assessS3Risk(bucket.Name);  // Proper handling of the bucket variable
                return {
                    Name: bucket.Name,
                    ResourceId: bucket.Name,
                    ResourceType: "S3Bucket",
                    Risk: Risk,
                    RiskDetail: RiskDetail
                };
            } catch (error) {
                console.error(`Error assessing risk for bucket ${bucket.Name}:`, error);
                return {
                    Name: bucket.Name,
                    ResourceId: bucket.Name,
                    ResourceType: "S3Bucket",
                    Risk: "Unknown",
                    RiskDetail: "Failed to assess risk due to an error"
                };
            }
        }));

        return bucketsWithRisk;
    } catch (error) {
        console.error("Failed to retrieve S3 buckets:", error);
        throw new Error(`Handler failure: ${error.message}`);
    }
}

async function listSubnets() {
    const regions = await listAllRegions();
    let allSubnets = [];

    for (const region of regions) {
        const ec2 = new EC2({ region: region });
        const data = await ec2.send(new DescribeSubnetsCommand({}));
        const routeTablesData = await ec2.send(new DescribeRouteTablesCommand({}));
        const routeTables = routeTablesData.RouteTables;

        const subnets = data.Subnets.map(subnet => {
            const riskDetails = [];
            const subnetRoutes = routeTables.filter(rt => rt.Associations.find(assoc => assoc.SubnetId === subnet.SubnetId));
            const hasPublicAccess = subnetRoutes.some(rt => rt.Routes.some(route => route.GatewayId && route.GatewayId.startsWith('igw-')));

            if (hasPublicAccess) {
                riskDetails.push("Public access via Internet Gateway.");
            }

            if (!subnet.Tags || !subnet.Tags.find(tag => tag.Key === "Environment")) {
                riskDetails.push("Missing 'Environment' tag.");
            }

            if (!subnet.Tags || !subnet.Tags.find(tag => tag.Key === "Owner")) {
                riskDetails.push("Missing 'Owner' tag.");
            }

            return {
                ResourceId: `${subnet.SubnetId}_${region}`,
                ResourceType: "EC2Subnet",
                SubnetId: subnet.SubnetId,
                AvailableIpAddressCount: subnet.AvailableIpAddressCount,
                CIDR: subnet.CidrBlock,
                Type: "Subnet",
                Risk: riskDetails.length > 0 ? "High" : "None",
                RiskDetail: riskDetails.join(" "),
                Tags: subnet.Tags ? subnet.Tags.map(tag => `${tag.Key}: ${tag.Value}`).join(", ") : "No Tags",
                Region: region
            };
        });

        allSubnets = allSubnets.concat(subnets);
    }

    return allSubnets;
}

async function listLambdaFunctions() {
    const command = new ListFunctionsCommand({});
    const data = await lambda.send(command);
    const functions = data.Functions;

    const functionsWithRisk = await Promise.all(functions.map(async func => {       
        const { Risk, RiskDetail } = await assessLambdaRisk(func);
        return {
            ResourceId: `${func.FunctionArn}`,
            ResourceType: "LambdaFunction",
            FunctionArn: func.FunctionArn,            
            Risk: Risk,
            RiskDetail: RiskDetail
        };
    }));

    return functionsWithRisk;
}

async function assessLambdaRisk(func) {
    if (!func.Role) {
        return {
            Risk: "High",
            RiskDetail: "Lambda function has no execution role assigned."
        };
    }

    try {
        const roleDetails = await iam.send(new GetRoleCommand({ RoleName: extractRoleNameFromARN(func.Role) }));
        const attachedPolicies = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleDetails.Role.RoleName }));
        const isOverlyPermissive = await checkRolePermissions(attachedPolicies.AttachedPolicies);

        return {
            Risk: isOverlyPermissive ? "High" : "None",
            RiskDetail: isOverlyPermissive ? "Lambda function role has overly permissive policies." : "Lambda function role permissions are within normal bounds."
        };
    } catch (error) {
        console.error(`Error assessing risk for Lambda function ${func.FunctionArn}:`, error);
        return {
            Risk: "Unknown",
            RiskDetail: "Could not assess risk due to an error"
        };
    }
}
async function listEBSVolumes() {
    const command = new DescribeVolumesCommand({});
    const data = await ec2.send(command);
    return data.Volumes.map(volume => ({        
        ResourceId: `${volume.VolumeId}_ebs`,
        ResourceType: "EBSVolume",
        VolumeId: volume.VolumeId,
        Encrypted: volume.Encrypted,
        Type: "EBSVolume",
        Risk: volume.Encrypted ? "None" : "High",
        RiskDetail: volume.Encrypted ? "Data Encrypted" : "Data is not Encrypted"
    }));
}

function extractRoleNameFromARN(roleArn) {
    return roleArn.split('/').pop();
}

async function checkRolePermissions(policies) {
    return policies.some(policy => policy.PolicyName.includes("AdministratorAccess"));
}

function analyzeSecurityGroup(securityGroup) {
    const { IpPermissions = [], IpPermissionsEgress = [] } = securityGroup;

    let riskLevel = "Low";
    let riskDetail = "No open inbound or outbound, and no missing or insecure inbound or outbound rules";

    const hasOpenRule = (rules) => rules.some(({ IpRanges = [] }) => IpRanges.some(({ CidrIp }) => ['0.0.0.0/0', '::/0'].includes(CidrIp)));
    const hasEmptyRules = (rules) => rules.length === 0 || rules.some(({ IpRanges = [] }) => IpRanges.length === 0);

    if (hasOpenRule(IpPermissions)) {
        riskLevel = "High";
        riskDetail = "Inbound is open to the world";
    } else if (hasOpenRule(IpPermissionsEgress)) {
        riskLevel = "High";
        riskDetail = "Outbound is open to the world";
    } else if (hasEmptyRules(IpPermissions)) {
        riskLevel = "Medium";
        riskDetail = "Missing inbound rules";
    } else if (hasEmptyRules(IpPermissionsEgress)) {
        riskLevel = "Medium";
        riskDetail = "Missing outbound rules";
    } else {
        const hasInsecureRule = (rules) => rules.some(({ IpRanges = [] }) => IpRanges.some(({ CidrIp }) => ['0.0.0.0/0', '::/0'].includes(CidrIp)));
        if (hasInsecureRule(IpPermissions)) {
            riskLevel = "Medium";
            riskDetail = "Insecure inbound rules";
        } else if (hasInsecureRule(IpPermissionsEgress)) {
            riskLevel = "Medium";
            riskDetail = "Insecure outbound rules";
        }
    }

    return { Risk: riskLevel, RiskDetail: riskDetail };
}

/**
 * Analyzes security groups to determine their risk based on the configurations.
 * @returns {Promise<Array<Object>>} List of security groups with risk assessments.
 */
async function listSecurityGroups() {
    const regions = await listRegions();
    let allSecurityGroups = [];

    for (const region of regions) {
        const ec2Regional = new EC2({ region });
        let nextToken;
        const params = {};

        do {
            if (nextToken) {
                params.NextToken = nextToken;
            }

            const command = new DescribeSecurityGroupsCommand(params);
            const data = await ec2Regional.send(command);
            if (!data || !data.SecurityGroups) {
                throw new Error(`Error listing security groups in region ${region}: empty response`);
            }

            const securityGroups = data.SecurityGroups.map(sg => {
                const { Risk, RiskDetail } = analyzeSecurityGroup(sg);
                return {
                    ResourceId: `${sg.GroupId}_sg_${region}`,
                    ResourceType: "EC2SecurityGroup",
                    Region: region,
                    Risk: Risk,
                    RiskDetail: RiskDetail,
                    ...sg
                };
            });

            allSecurityGroups = allSecurityGroups.concat(securityGroups);
            nextToken = data.NextToken;
        } while (nextToken);
    }

    return allSecurityGroups;
}
