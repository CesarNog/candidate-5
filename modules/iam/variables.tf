variable "environment" {
  default = "dev"
  type        = string
  description = "The deployment environment (e.g., dev, prod)"
}

variable "base_name" {
  type        = string
  description = "Base name for IAM resources to ensure they are unique and identifiable"
}
