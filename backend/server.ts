import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "node:https";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  DynamoDBClient,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  LambdaClient,
  ListFunctionsCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  CopyObjectCommand,
  DeleteBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  DeleteMessageCommand,
  ListQueuesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DescribeEventBusCommand,
  EventBridgeClient,
  ListEventBusesCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  PublishCommand,
  ListTopicsCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type _InstanceType,
} from "@aws-sdk/client-ec2";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 3000);
const region = process.env.AWS_REGION || "us-west-2";
const fallbackCredentials = { accessKeyId: "local", secretAccessKey: "local" };

type ResourceBody = {
  service?: string;
  name?: string;
  value?: string;
  url?: string;
  arn?: string;
  [key: string]: unknown;
};

type ResourceValue = {
  name?: string;
  created?: string;
  [key: string]: unknown;
};

type ServiceDefinition = {
  label: string;
  type: string;
  client: string;
  create?: (client: any, body: ResourceBody) => Promise<unknown>;
  list?: (client: any) => Promise<ResourceValue[]>;
  remove?: (client: any, resource: ResourceBody) => Promise<unknown>;
};

function endpointFrom(requestUrl: URL): string {
  const endpoint = requestUrl.searchParams.get("endpoint");
  if (!endpoint) throw new Error("An emulator endpoint is required.");
  const parsed = new URL(endpoint);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Endpoint must use HTTP or HTTPS.");
  return parsed.toString().replace(/\/$/, "");
}

async function emulatorOptions(endpoint: string): Promise<Record<string, unknown>> {
  const parsed = new URL(endpoint);
  const directory = join(homedir(), ".aws", "emulator", parsed.port || "9297");
  let credentials = fallbackCredentials;
  let ca;
  try {
    const credentialsFile = await readFile(join(directory, "emulator_credentials"), "utf8");
    const values = Object.fromEntries(credentialsFile.split("\n").filter((line) => line.includes("=")).map((line) => line.split("=", 2).map((value) => value.trim())));
    if (values.aws_access_key_id && values.aws_secret_access_key) {
      credentials = { accessKeyId: values.aws_access_key_id, secretAccessKey: values.aws_secret_access_key };
    }
  } catch {
    // The fallback credentials support an emulator started with --auth off.
  }
  if (parsed.protocol === "https:") {
    ca = await readFile(join(directory, "ca.pem"));
  }
  return {
    endpoint,
    region,
    credentials,
    disableHostPrefix: true,
    ...(ca ? { requestHandler: new NodeHttpHandler({ httpsAgent: new Agent({ ca }) }) } : {}),
  };
}

async function clients(endpoint: string): Promise<Record<string, any>> {
  const options = await emulatorOptions(endpoint);
  return {
    S3: new S3Client(options),
    DynamoDB: new DynamoDBClient(options),
    SQS: new SQSClient(options),
    Lambda: new LambdaClient(options),
    EventBridge: new EventBridgeClient(options),
    CloudWatchLogs: new CloudWatchLogsClient(options),
    SecretsManager: new SecretsManagerClient(options),
    SNS: new SNSClient(options),
    EC2: new EC2Client(options),
  };
}

const dynamoCreationDates = new Map<string, string>();

const serviceCatalog: Record<string, ServiceDefinition> = {
  S3: {
    label: "Simple Storage", type: "Bucket", client: "S3",
    create: (client, body) => client.send(new CreateBucketCommand({ Bucket: body.name })),
    list: (client) => client.send(new ListBucketsCommand({})).then((result) => (result.Buckets || []).map((item) => ({ name: item.Name, created: item.CreationDate?.toISOString() || "" }))),
    remove: (client, resource) => client.send(new DeleteBucketCommand({ Bucket: resource.name })),
  },
  DynamoDB: {
    label: "DynamoDB", type: "Table", client: "DynamoDB",
    create: (client, body) => client.send(new CreateTableCommand({ TableName: body.name, AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }], KeySchema: [{ AttributeName: "id", KeyType: "HASH" }], BillingMode: "PAY_PER_REQUEST" })),
    list: async (client) => {
      const result = await client.send(new ListTablesCommand({}));
      return Promise.all((result.TableNames || []).map(async (name) => {
        const table = await client.send(new DescribeTableCommand({ TableName: name }));
        return {
          name,
          created: table.Table?.CreationDateTime
            ? new Date(table.Table.CreationDateTime).toISOString()
            : dynamoCreationDates.get(name) || "",
        };
      }));
    },
    remove: (client, resource) => client.send(new DeleteTableCommand({ TableName: resource.name })),
  },
  SQS: {
    label: "Queue Service", type: "Queue", client: "SQS",
    create: (client, body) => client.send(new CreateQueueCommand({ QueueName: body.name })),
    list: (client) => client.send(new ListQueuesCommand({})).then((result) => (result.QueueUrls || []).map((url) => ({ name: url.split("/").pop(), url }))),
    remove: (client, resource) => client.send(new DeleteQueueCommand({ QueueUrl: resource.url })),
  },
  SNS: {
    label: "Simple Notification", type: "Topic", client: "SNS",
    create: (client, body) => client.send(new CreateTopicCommand({ Name: body.name })),
    list: (client) => client.send(new ListTopicsCommand({})).then((result) => (result.Topics || []).map((item) => ({ name: item.TopicArn.split(":").pop(), arn: item.TopicArn }))),
    remove: (client, resource) => client.send(new DeleteTopicCommand({ TopicArn: resource.arn })),
  },
  EventBridge: {
    label: "EventBridge", type: "Event bus", client: "EventBridge",
    create: (client, body) => client.send(new CreateEventBusCommand({ Name: body.name })),
    list: (client) => client.send(new ListEventBusesCommand({})).then((result) => (result.EventBuses || []).map((item) => ({ name: item.Name, created: item.CreationTime?.toISOString() || "" }))),
    remove: (client, resource) => client.send(new DeleteEventBusCommand({ Name: resource.name })),
  },
  CloudWatchLogs: {
    label: "CloudWatch Logs", type: "Log group", client: "CloudWatchLogs",
    create: (client, body) => client.send(new CreateLogGroupCommand({ logGroupName: body.name })),
    list: (client) => client.send(new DescribeLogGroupsCommand({})).then((result) => (result.logGroups || []).map((item) => ({ name: item.logGroupName, created: item.creationTime ? new Date(item.creationTime).toISOString() : "" }))),
    remove: (client, resource) => client.send(new DeleteLogGroupCommand({ logGroupName: resource.name })),
  },
  SecretsManager: {
    label: "Secrets Manager", type: "Secret", client: "SecretsManager",
    create: (client, body) => client.send(new CreateSecretCommand({ Name: body.name, SecretString: body.value || "" })),
    list: (client) => client.send(new ListSecretsCommand({})).then((result) => (result.SecretList || []).map((item) => ({ name: item.Name, created: item.CreatedDate?.toISOString() || "" }))),
    remove: (client, resource) => client.send(new DeleteSecretCommand({ SecretId: resource.name, ForceDeleteWithoutRecovery: true })),
  },
  Lambda: {
    label: "Lambda", type: "Function", client: "Lambda",
    list: (client) => client.send(new ListFunctionsCommand({})).then((result) => (result.Functions || []).map((item) => ({ name: item.FunctionName, created: item.LastModified || "" }))),
    remove: (client, resource) => client.send(new DeleteFunctionCommand({ FunctionName: resource.name })),
  },
  EC2: {
    label: "Elastic Compute Cloud", type: "Instance", client: "EC2",
    create: (client, body) => client.send(new RunInstancesCommand({
      ImageId: body.imageId as string,
      InstanceType: (typeof body.instanceType === "string" && body.instanceType ? body.instanceType : "t3.micro") as _InstanceType,
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [{ ResourceType: "instance", Tags: [{ Key: "Name", Value: typeof body.name === "string" ? body.name : "" }] }],
    })),
    list: async (client) => {
      const result = await client.send(new DescribeInstancesCommand({}));
      return (result.Reservations || []).flatMap((reservation: any) => (reservation.Instances || []).map((instance: any) => ({
        name: instance.Tags?.find((tag: any) => tag.Key === "Name")?.Value || instance.InstanceId,
        instanceId: instance.InstanceId,
        state: instance.State?.Name || "unknown",
        instanceType: instance.InstanceType,
        imageId: instance.ImageId,
      })));
    },
    remove: (client, resource) => client.send(new TerminateInstancesCommand({
      InstanceIds: [typeof resource.instanceId === "string" ? resource.instanceId : resource.name as string],
    })),
  },
};

function normalizedResources(service: string, values: ResourceValue[]) {
  const definition = serviceCatalog[service];
  return values.map((item) => ({ id: `${service}-${item.name}`, service, name: item.name, type: definition.type, created: item.created || "", status: "Active", ...item }));
}

async function listResources(endpoint: string) {
  const serviceClients = await clients(endpoint);
  const entries = await Promise.all(Object.entries(serviceCatalog).map(async ([service, definition]) => {
    if (!definition.list) return [];
    return normalizedResources(service, await definition.list(serviceClients[definition.client]));
  }));
  return entries.flat();
}

async function createResource(endpoint: string, body: ResourceBody) {
  const serviceClients = await clients(endpoint);
  if (!body.name || !body.service) throw new Error("Service and resource name are required.");
  if (body.service === "EC2" && (typeof body.imageId !== "string" || !/^ami-[0-9a-f]+$/i.test(body.imageId))) {
    throw new Error("EC2 requires a valid AMI ID such as ami-12345678.");
  }
  const definition = serviceCatalog[body.service];
  if (!definition?.create) throw new Error(`${body.service} creation is not available in the console form yet.`);
  await definition.create(serviceClients[definition.client], body);
  if (body.service === "DynamoDB") dynamoCreationDates.set(body.name, new Date().toISOString());
  return (await listResources(endpoint)).find((resource) => resource.service === body.service && resource.name === body.name);
}

async function deleteResource(endpoint: string, body: ResourceBody) {
  const serviceClients = await clients(endpoint);
  if (!body.service || !body.name) throw new Error("Service and resource name are required.");
  const definition = serviceCatalog[body.service];
  if (!definition?.remove) throw new Error(`Unsupported service: ${body.service}`);
  await definition.remove(serviceClients[definition.client], body);
}

async function resourceAction(endpoint: string, body: ResourceBody) {
  const client = (await clients(endpoint))[body.service as string];
  const name = body.name as string;
  switch (body.action) {
    case "s3-list": {
      const result = await client.send(new ListObjectsV2Command({ Bucket: name }));
      return { items: (result.Contents || []).map((item: any) => ({ key: item.Key, size: item.Size, modified: item.LastModified?.toISOString() || "" })) };
    }
    case "s3-put":
      await client.send(new PutObjectCommand({ Bucket: name, Key: body.key as string, Body: body.content as string, ContentType: "text/plain; charset=utf-8" })); return { ok: true };
    case "s3-upload": {
      const bytes = Buffer.from(body.content as string, "base64");
      await client.send(new PutObjectCommand({ Bucket: name, Key: body.key as string, Body: bytes, ContentType: typeof body.contentType === "string" ? body.contentType : "application/octet-stream" }));
      return { ok: true };
    }
    case "s3-get": {
      const result = await client.send(new GetObjectCommand({ Bucket: name, Key: body.key as string }));
      const bytes = result.Body ? Buffer.from(await result.Body.transformToByteArray()) : Buffer.alloc(0);
      return {
        content: bytes.toString("base64"),
        contentType: result.ContentType || "application/octet-stream",
      };
    }
    case "s3-delete":
      await client.send(new DeleteObjectCommand({ Bucket: name, Key: body.key as string })); return { ok: true };
    case "s3-rename-object": {
      const newKey = body.newKey as string;
      if (!newKey) throw new Error("The new object name is required.");
      await client.send(new CopyObjectCommand({ Bucket: name, CopySource: `${name}/${encodeURIComponent(body.key as string)}`, Key: newKey }));
      await client.send(new DeleteObjectCommand({ Bucket: name, Key: body.key as string }));
      return { ok: true };
    }
    case "s3-rename-bucket": {
      const newName = body.newName as string;
      if (!newName) throw new Error("The new bucket name is required.");
      await client.send(new CreateBucketCommand({ Bucket: newName }));
      const objects = await client.send(new ListObjectsV2Command({ Bucket: name }));
      for (const item of objects.Contents || []) {
        if (!item.Key) continue;
        await client.send(new CopyObjectCommand({ Bucket: newName, CopySource: `${name}/${encodeURIComponent(item.Key)}`, Key: item.Key }));
        await client.send(new DeleteObjectCommand({ Bucket: name, Key: item.Key }));
      }
      await client.send(new DeleteBucketCommand({ Bucket: name }));
      return { ok: true, name: newName };
    }
    case "ddb-list": {
      const result = await client.send(new ScanCommand({ TableName: name })); return { items: result.Items || [] };
    }
    case "ddb-put":
      await client.send(new PutItemCommand({ TableName: name, Item: { id: { S: body.key as string }, value: { S: body.content as string } } })); return { ok: true };
    case "ddb-get": {
      const result = await client.send(new GetItemCommand({ TableName: name, Key: { id: { S: body.key as string } } })); return { item: result.Item || null };
    }
    case "sqs-receive": {
      const result = await client.send(new ReceiveMessageCommand({ QueueUrl: body.url as string, MaxNumberOfMessages: 10, WaitTimeSeconds: 0 })); return { messages: result.Messages || [] };
    }
    case "sqs-send":
      await client.send(new SendMessageCommand({ QueueUrl: body.url as string, MessageBody: body.content as string })); return { ok: true };
    case "sqs-delete":
      await client.send(new DeleteMessageCommand({ QueueUrl: body.url as string, ReceiptHandle: body.receiptHandle as string })); return { ok: true };
    case "sns-publish":
      await client.send(new PublishCommand({ TopicArn: body.arn as string, Message: body.content as string })); return { ok: true };
    case "secret-read": {
      const result = await client.send(new GetSecretValueCommand({ SecretId: name })); return { value: result.SecretString || "" };
    }
    default: throw new Error("Unsupported resource action.");
  }
}

async function jsonBody(request: IncomingMessage): Promise<ResourceBody> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  try {
    if (request.method === "GET" && url.pathname === "/api/services") {
      return sendJson(response, 200, { services: Object.entries(serviceCatalog).map(([id, definition]) => ({ id, label: definition.label, type: definition.type, canCreate: Boolean(definition.create) })) });
    }
    const endpoint = endpointFrom(url);
    if (request.method === "GET" && url.pathname === "/api/resources") {
      return sendJson(response, 200, { resources: await listResources(endpoint) });
    }
    if (request.method === "POST" && url.pathname === "/api/resources") {
      return sendJson(response, 201, { resource: await createResource(endpoint, await jsonBody(request)) });
    }
    if (request.method === "DELETE" && url.pathname === "/api/resources") {
      await deleteResource(endpoint, await jsonBody(request));
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === "POST" && url.pathname === "/api/resource-action") {
      const body = await jsonBody(request);
      if (!body.service || !body.name || !body.action) throw new Error("Service, resource name, and action are required.");
      return sendJson(response, 200, await resourceAction(endpoint, body));
    }
    return sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    return sendJson(response, 502, { error: error instanceof Error ? error.message : "The emulator request failed." });
  }
}

async function serveStatic(response: ServerResponse, pathname: string): Promise<void> {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = resolve(root, requested);
  const pathFromRoot = relative(root, filePath);
  if (isAbsolute(pathFromRoot) || pathFromRoot === ".." || pathFromRoot.startsWith(".." + (process.platform === "win32" ? "\\" : "/"))) {
    return sendJson(response, 403, { error: "Forbidden." });
  }
  try {
    const content = await readFile(filePath);
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
    response.writeHead(200, { "content-type": `${types[extname(filePath)] || "application/octet-stream"}; charset=utf-8` });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "File not found." });
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
  else await serveStatic(response, url.pathname);
}).listen(port, () => console.log(`AWS Emulator Console running at http://127.0.0.1:${port}`));
