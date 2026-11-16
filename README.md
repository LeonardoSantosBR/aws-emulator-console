## Run AWS Emulator

Start the emulator **before** the console, and keep its terminal open. Press
`Ctrl+C` to stop it (all emulated resources are lost, since they live in
memory).

### Linux (RPM or Debian package)

Install (Amazon Linux 2023 example; see the
[Linux guide](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-linux.html)
for other distributions):

```bash
PKG=https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest
sudo dnf install -y $PKG/aws-emulator-x86_64.rpm
aws-emulator -v
```

Run:

```bash
aws-emulator
```

### macOS and Windows (Docker)

There is no prebuilt image. Build one from this `Dockerfile` (on Arm
processors, use `aws-emulator-aarch64.rpm` instead of `x86_64`):

```dockerfile
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal
ADD https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator-x86_64.rpm /tmp/aws-emulator.rpm
RUN rpm -i /tmp/aws-emulator.rpm && rm /tmp/aws-emulator.rpm \
    && mkdir -p /home/emulator && chown 1000 /home/emulator
USER 1000
ENV HOME=/home/emulator
EXPOSE 9297
ENTRYPOINT ["aws-emulator", "-b", "0.0.0.0"]
```

No PowerShell, execute os comandos a partir da raiz deste repositório:

```powershell
docker build -t aws-emulator .
```

Run on **macOS**:

```bash
mkdir -p ~/.aws/emulator
PORT=9297
docker run --rm --memory=2g --memory-swap=2g -p 127.0.0.1:$PORT:$PORT \
  -e HOME="$HOME" -v "$HOME/.aws/emulator:$HOME/.aws/emulator" \
  aws-emulator -p $PORT
```

Run on **Windows (PowerShell)**:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.aws\emulator"
$port = 9297
docker run --rm --memory=2g --memory-swap=2g -p "127.0.0.1:${port}:${port}" `
  -v "$env:USERPROFILE\.aws\emulator:/home/emulator/.aws/emulator" `
  aws-emulator -p $port
```

Deixe esse terminal aberto. O volume é obrigatório: ele faz com que os arquivos
gerados pelo emulator (`ca.pem`, `config` e `emulator_credentials`) também
fiquem disponíveis para a console no Windows. Sem esse volume, a console falha
com `ENOENT` ao tentar abrir `C:\Users\<usuário>\.aws\emulator\9297\ca.pem`.

Em outro terminal, confirme que o certificado foi gerado e que o emulator está
respondendo:

```powershell
Test-Path "$env:USERPROFILE\.aws\emulator\9297\ca.pem"
curl.exe --cacert "$env:USERPROFILE\.aws\emulator\9297\ca.pem" `
  https://127.0.0.1:9297/__admin/health
```

O primeiro comando deve retornar `True` e o segundo deve retornar `ok`.

Always bind to `127.0.0.1` (not just `-p 9297:9297`), otherwise the emulator
is exposed to your whole network.

### Check that the emulator is ready

macOS / Linux:

```bash
curl --cacert ~/.aws/emulator/9297/ca.pem https://127.0.0.1:9297/__admin/health
```

Windows (PowerShell; use `curl.exe`, since `curl` is an alias of
`Invoke-WebRequest`):

```powershell
curl.exe --cacert "$env:USERPROFILE\.aws\emulator\9297\ca.pem" https://127.0.0.1:9297/__admin/health
```

The expected response is `ok`.

### (Optional) Use the AWS CLI against the emulator

The console does not need these variables because it reads the emulator files
itself. Set them only to use the AWS CLI or your own SDK code.

macOS / Linux: see the `export` block in
[AWS SDK compatibility](#aws-sdk-compatibility).

Windows (PowerShell):

```powershell
$base = "$env:USERPROFILE\.aws\emulator\9297"
$env:AWS_ENDPOINT_URL = "https://127.0.0.1:9297"
$env:AWS_SHARED_CREDENTIALS_FILE = "$base\emulator_credentials"
$env:AWS_CONFIG_FILE = "$base\config"
$env:AWS_CA_BUNDLE = "$base\ca.pem"
$env:AWS_EC2_METADATA_DISABLED = "true"
$env:AWS_DISABLE_HOST_PREFIX_INJECTION = "true"
$env:AWS_REGION = "us-east-1"
$env:AWS_DEFAULT_REGION = "us-east-1"
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN, Env:AWS_PROFILE -ErrorAction SilentlyContinue

aws sts get-caller-identity
```

`AWS_CA_BUNDLE` is required on Windows with Docker: the generated `config`
file contains container paths (`/home/emulator/...`) that do not exist on the
host.

### Quick start (emulator + console)

1. Terminal 1: start the emulator (commands above) and leave it running.
2. Terminal 2, in this repository:

```bash
npm install
npm start
```

3. Open <http://127.0.0.1:3000>.

If you restart the emulator, its credentials change; reload the console.
