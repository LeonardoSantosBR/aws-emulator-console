# AWS Emulator Console

Local web console for managing resources in
[AWS Emulator](https://github.com/aws/aws-emulator) without writing AWS CLI
commands. The console sends requests through AWS SDK for JavaScript clients to
the emulator's normal AWS-compatible endpoint.

> **Important:** AWS Emulator and this console are for local development and
> testing. Do not use them for production workloads or security testing.

## How it works

AWS Emulator does not expose a separate console API. It exposes the AWS APIs
over one local HTTPS endpoint. This project has two parts:

1. The browser provides the resource-management UI.
2. `backend/server.ts` is a same-origin adapter that creates AWS SDK clients and points
   them at the configured emulator endpoint.

The adapter reads the emulator-generated certificate and credentials from
`~/.aws/emulator/<port>/` so requests are signed and HTTPS is trusted in the
same way as an SDK configured according to the official documentation.

## Prerequisites

- Node.js 18 or newer
- npm
- AWS Emulator installed and running

Follow the official setup path for your operating system:

- [AWS Emulator getting started](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html)
- [Linux installation](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-linux.html)
- [Docker installation](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-docker.html)

The default server-mode endpoint is:

```text
https://127.0.0.1:9297
```

AWS Emulator writes its runtime files here by default:

```text
~/.aws/emulator/9297/
├── ca.pem
├── config
└── emulator_credentials
```

Check that the emulator is ready:

```bash
curl --cacert ~/.aws/emulator/9297/ca.pem \
  https://127.0.0.1:9297/__admin/health
```

The expected response is `ok`.

## Start the console

From this repository:

```bash
npm install
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

If the emulator uses another port, select **Configure endpoint** in the
console and enter its complete HTTPS URL, for example:

```text
https://127.0.0.1:9300
```

The adapter uses the port in that URL to find the matching emulator files
under `~/.aws/emulator/<port>/`.

## What this console can create

The current UI supports real create, list, and delete calls for:

| Service | Resource | Create behavior |
| --- | --- | --- |
| Amazon S3 | Bucket | Creates a bucket with the entered name |
| Amazon DynamoDB | Table | Creates an on-demand table with a string `id` partition key |
| Amazon SQS | Queue | Creates a queue with the entered name |
| Amazon SNS | Topic | Creates a topic with the entered name |
| Amazon EventBridge | Event bus | Creates an event bus with the entered name |
| Amazon CloudWatch Logs | Log group | Creates a log group with the entered name |
| AWS Secrets Manager | Secret | Creates a secret with an optional value |
| Amazon EC2 | Instance | Runs one instance with the entered AMI ID and instance type; the AMI must be a valid `ami-...` identifier |

Lambda functions can currently be listed and deleted. Creating a Lambda
function needs additional information that is not represented by the basic
form, including deployment code, runtime, handler, and execution role. The
console reports that requirement instead of creating a local placeholder.

### EC2 AMI requirement

EC2 creation requires an **actual AMI available to the local AWS Emulator**.
The console does not create or emulate an AMI automatically. Enter the AMI ID
in the form, for example:

```text
ami-12345678
```

The ID must be accepted by the emulator for the configured region. A
placeholder such as `ami-local` is invalid and will be rejected by the EC2
API.

All create actions are sent to the emulator. The browser does not treat
localStorage as the resource database. Refreshing the page lists the resources
that actually exist in the emulator.

## AWS SDK compatibility

AWS Emulator is designed to work with AWS CLI and AWS SDKs by changing the
endpoint and local trust/credential settings, not by changing application
logic. The official SDK setup is documented in
[Pointing your AWS SDK at AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/point-sdk-to-emulator.html).

For macOS/Linux SDK processes, the documented environment is:

```bash
export AWS_ENDPOINT_URL=https://127.0.0.1:9297
export AWS_SHARED_CREDENTIALS_FILE="$HOME/.aws/emulator/9297/emulator_credentials"
export AWS_CONFIG_FILE="$HOME/.aws/emulator/9297/config"
export AWS_CA_BUNDLE="$HOME/.aws/emulator/9297/ca.pem"
export AWS_EC2_METADATA_DISABLED=true
export AWS_DISABLE_HOST_PREFIX_INJECTION=true
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
```

The console follows the same model internally:

- AWS SDK for JavaScript v3 clients
- SigV4 requests using the current emulator credentials
- the emulator CA certificate for HTTPS
- host-prefix injection disabled
- one configured region and one emulator endpoint

This means resources created by an SDK or the AWS CLI can be discovered by the
console, and resources created by the console can be used by SDK code.

For example, after configuring the environment above, an SDK call such as
`s3.createBucket(...)` and the console's **Create resource** action operate on
the same emulator state.

## Emulator scope versus console scope

AWS Emulator covers a much broader AWS API surface than the console currently
exposes. Its official repository organizes implementations by AWS service and
tracks known gaps and fidelity in the
[repository issues](https://github.com/aws/aws-emulator/tree/main/issues) and
[release information](https://github.com/aws/aws-emulator/releases).

The long-term goal of this project is to expose more of those SDK operations
through a generic service/operation interface, while keeping the emulator
itself as the source of truth. Adding a service to the emulator does not
automatically add a form to this console; the corresponding SDK client,
operation inputs, output display, and safe delete behavior must be added to
the console adapter.

## Contributing

Contributions are welcome. Before changing the project:

1. Start AWS Emulator and confirm its health endpoint responds with `ok`.
2. Install dependencies with `npm install`.
3. Run the console with `npm start`.
4. Make the smallest change that fully addresses the issue.
5. Run the checks below before opening a pull request.

```bash
npm install
node --check backend/app.js
npm run typecheck
git diff --check
```

When adding a service, update all of the related layers:

- Add the AWS SDK client package to `package.json`.
- Add the client and commands to the service catalog in `backend/server.ts`.
- Add the service navigation item and creation form behavior in `index.html`
  and `backend/app.js`.
- Add resource-specific presentation and styling when needed.
- Document the new resource and any emulator fidelity limitations in this
  README.
- Verify create, list, and delete behavior against a running local emulator.

Keep credentials, generated emulator certificates, `node_modules/`, and local
resource data out of commits. Use the emulator's generated credentials only
for local development, and never point validation commands at a production
AWS account.

Open pull requests with a clear description of the behavior changed, the
commands used for validation, and any emulator operations that could not be
verified locally.

## AWS Emulator limitations

According to the official documentation:

- Resource state is held in memory and is lost when the emulator stops.
- Use one region and one account per emulator instance.
- Emulator behavior differs by service and feature; check published fidelity
  information and known issues.
- IAM policy behavior is not equivalent to AWS and must not be used for
  security testing.
- The default local process uses HTTPS and generated credentials.

See the official
[AWS Emulator user guide](https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html)
and [official repository](https://github.com/aws/aws-emulator) for the
current service coverage and release-specific behavior.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Console layout |
| `styles.css` | Console styling |
| `backend/app.js` | Browser state, views, and API calls |
| `backend/server.ts` | AWS SDK adapter and static file server |
