# Deployment Guide

This document covers three deployment targets:

1. [Render.com](#rendercom) — simplest, recommended for most users
2. [AWS ECS Fargate](#aws-ecs-fargate) — for teams already on AWS
3. [Local development](#local-development)

All deployments use the same Docker image.  No `.env` files are committed.  All secrets come from the deployment platform's secret store.

---

## Render.com

### Prerequisites

- A [Render](https://render.com) account
- This repo pushed to a GitHub repository you control
- A Supabase project with the migration applied (see root README)
- A Resend account with a verified sending domain (see root README)

### Step 1: Create a Web Service

1. In Render, click **New → Web Service**.
2. Connect your GitHub repository.
3. Give the service a name (e.g., `ai-tutor`).

### Step 2: Configure the build

1. Under **Runtime**, select **Docker**.
2. Leave **Dockerfile path** as `./Dockerfile`.
3. Leave **Docker build context** as `.` (repo root).

### Step 3: Set environment variables

In the **Environment** section, add the following key/value pairs.  Do not use a `.env` file.

| Key | Value | Required |
|-----|-------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | **yes** |
| `SUPABASE_URL` | Your Supabase project URL | no (disables persistence) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | no (disables persistence) |
| `RESEND_API_KEY` | Your Resend API key | no (disables email) |
| `PARENT_EMAIL` | Email address to receive transcripts | no (disables email) |
| `EMAIL_FROM` | Sender address (verified Resend domain) | no |
| `CORS_ORIGIN` | Your app URL (e.g., `https://ai-tutor.onrender.com`) | no (defaults to `*`) |
| `PORT` | `3000` | no (Render sets this automatically) |

Mark `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` as **Secret** in the Render UI.

### Step 4: Set the health check path

Under **Advanced**, set **Health Check Path** to `/api/config`.

### Step 5: Deploy

Click **Create Web Service**.  Render will:
1. Pull your repo
2. Build the Docker image (2–5 minutes on first build)
3. Start the container
4. Route traffic once the health check passes

Subsequent pushes to your main branch trigger automatic rebuilds if **Auto-Deploy** is enabled.

### Using render.yaml

Instead of manual configuration, you can use the `render.yaml` in the repo root:

1. In Render, click **New → Blueprint**.
2. Connect your repository.
3. Render will detect `render.yaml` and pre-fill the service configuration.
4. You still need to set secret env vars manually (Render will prompt for `sync: false` vars).

---

## AWS ECS Fargate

This setup uses:
- **ECR** — container registry
- **ECS Fargate** — serverless container runtime
- **ALB** — Application Load Balancer (HTTPS termination)
- **SSM Parameter Store** — secrets management
- **Supabase** — remains external (not on AWS)

### Prerequisites

- AWS account with permissions for ECR, ECS, IAM, ALB, SSM
- AWS CLI configured (`aws configure`)
- Docker installed locally

### Step 1: Push the image to ECR

```bash
# Create the ECR repository (one time)
aws ecr create-repository --repository-name ai-tutor --region us-east-1

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t ai-tutor .
docker tag ai-tutor:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/ai-tutor:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/ai-tutor:latest
```

### Step 2: Store secrets in SSM Parameter Store

```bash
aws ssm put-parameter \
  --name "/ai-tutor/ANTHROPIC_API_KEY" \
  --value "sk-ant-..." \
  --type SecureString

aws ssm put-parameter \
  --name "/ai-tutor/SUPABASE_SERVICE_ROLE_KEY" \
  --value "eyJ..." \
  --type SecureString

aws ssm put-parameter \
  --name "/ai-tutor/RESEND_API_KEY" \
  --value "re_..." \
  --type SecureString
```

Store non-secret values as `String`:

```bash
aws ssm put-parameter --name "/ai-tutor/SUPABASE_URL" --value "https://..." --type String
aws ssm put-parameter --name "/ai-tutor/PARENT_EMAIL" --value "you@..." --type String
aws ssm put-parameter --name "/ai-tutor/EMAIL_FROM" --value "tutor@..." --type String
```

### Step 3: Create an ECS task definition

Create `task-definition.json`:

```json
{
  "family": "ai-tutor",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "ai-tutor",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/ai-tutor:latest",
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "environment": [
        { "name": "PORT", "value": "3000" },
        { "name": "MODEL", "value": "claude-sonnet-4-6" },
        { "name": "EXTENDED_THINKING", "value": "true" }
      ],
      "secrets": [
        { "name": "ANTHROPIC_API_KEY", "valueFrom": "/ai-tutor/ANTHROPIC_API_KEY" },
        { "name": "SUPABASE_URL", "valueFrom": "/ai-tutor/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "/ai-tutor/SUPABASE_SERVICE_ROLE_KEY" },
        { "name": "RESEND_API_KEY", "valueFrom": "/ai-tutor/RESEND_API_KEY" },
        { "name": "PARENT_EMAIL", "valueFrom": "/ai-tutor/PARENT_EMAIL" },
        { "name": "EMAIL_FROM", "valueFrom": "/ai-tutor/EMAIL_FROM" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ai-tutor",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

Register it:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### Step 4: Create an ECS cluster and service

```bash
# Create cluster
aws ecs create-cluster --cluster-name ai-tutor

# Create service (attach to your VPC/subnets/security groups and ALB target group)
aws ecs create-service \
  --cluster ai-tutor \
  --service-name ai-tutor \
  --task-definition ai-tutor \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=ai-tutor,containerPort=3000"
```

### Step 5: ALB setup

1. Create an Application Load Balancer with an HTTPS listener (ACM certificate).
2. Create a target group: IP type, port 3000, health check path `/api/config`.
3. Register the ECS service with the target group (done via `--load-balancers` above).

### Step 6: Set CORS_ORIGIN

Once you have your ALB DNS name or custom domain:

```bash
aws ssm put-parameter \
  --name "/ai-tutor/CORS_ORIGIN" \
  --value "https://your-domain.com" \
  --type String
```

Update the task definition to include this parameter and redeploy.

### Updating the image

```bash
docker build -t ai-tutor .
docker tag ai-tutor:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/ai-tutor:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/ai-tutor:latest

aws ecs update-service --cluster ai-tutor --service ai-tutor --force-new-deployment
```

---

## Local development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
# Install all workspace dependencies
npm install

# Build all TypeScript packages
npm run build
```

### Environment variables

Do not create `.env` files.  Export variables in your shell session:

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# Optional — app works without these
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
export RESEND_API_KEY=re_...
export PARENT_EMAIL=you@example.com
export EMAIL_FROM=tutor@yourdomain.com
```

To persist across terminal sessions, add the exports to your `~/.zshrc` or `~/.bashrc`.

### Running the web interface

```bash
npm run api
# Open http://localhost:3000
```

### Running in watch mode

```bash
npm run dev
# Rebuilds and restarts on source changes
```

### Running the CLI

```bash
npm run cli
```

### Running tests

The test harness uses character briefs in `tests/` with the Claude Chrome extension or manual interaction.  See [tests/README.md](../tests/README.md) for instructions.

There are no automated unit or integration tests in this repo (yet).
