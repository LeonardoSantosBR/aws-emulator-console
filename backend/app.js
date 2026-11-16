const state = {
  view: "overview",
  service: null,
  resources: [],
  endpoint: (() => {
    const stored = localStorage.getItem("emulator-endpoint");
    return !stored || stored === "http://127.0.0.1:4566" ? "https://127.0.0.1:9297" : stored;
  })(),
  loading: false,
};

const $ = (selector) => document.querySelector(selector);
const serviceMeta = {
  S3: { label: "Simple Storage", icon: "amazon-aws-S3-icon.svg", className: "badge-s3" },
  DynamoDB: { label: "DynamoDB", icon: "amazon-aws-DynamoDb-icon.svg", className: "badge-dynamo" },
  SQS: { label: "Queue Service", icon: "amazon-aws-Sqs-icon.svg", className: "badge-sqs" },
  SNS: { label: "Notifications", icon: "amazon-aws-Sns-icon.svg", className: "badge-sns" },
  EventBridge: { label: "EventBridge", icon: "amazon-aws-EventBridge-icon.svg", className: "badge-eventbridge" },
  CloudWatchLogs: { label: "CloudWatch Logs", icon: "amazon-aws-CloudWatch-icon.svg", className: "badge-logs" },
  SecretsManager: { label: "Secrets Manager", icon: "amazon-aws-SecretsManager.svg", className: "badge-secrets" },
  EC2: { label: "Elastic Compute Cloud", icon: "amazon-aws-Ec2-icon.svg", className: "badge-ec2" },
  Lambda: { label: "Lambda", icon: "amazon-aws-Lambda-icon.svg", className: "badge-lambda" },
};

function save() {
  localStorage.setItem("emulator-endpoint", state.endpoint);
}

function apiUrl() {
  return `/api/resources?endpoint=${encodeURIComponent(state.endpoint)}`;
}

async function loadResources() {
  state.loading = true;
  try {
    const response = await fetch(apiUrl());
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not reach the emulator.");
    state.resources = payload.resources;
    $("#connection-label").textContent = "Connected";
    $(".status-dot").style.background = "var(--green)";
  } catch (error) {
    state.resources = [];
    $("#connection-label").textContent = "Unavailable";
    $(".status-dot").style.background = "var(--red)";
    showError(error.message);
  } finally {
    state.loading = false;
    render();
  }
}

function showError(message) {
  const existing = document.querySelector(".api-error");
  if (existing) existing.remove();
  const error = document.createElement("div");
  error.className = "api-error";
  error.textContent = message;
  $(".page-content").prepend(error);
}

function resourceCards() {
  return Object.entries(serviceMeta).map(([service, meta]) => {
    const count = state.resources.filter((resource) => resource.service === service).length;
    return `<button class="resource-card" data-service="${service}">
      <div class="resource-card-top"><span class="service-badge ${meta.className}"><img src="assets/${meta.icon}" alt="" /></span><span class="resource-count">${count}</span></div>
      <h3>${meta.label}</h3><p>${service} resources</p>
    </button>`;
  }).join("");
}

function activityRows() {
  const recent = state.resources.slice(-4).reverse();
  return recent.map((resource, index) => `<div class="activity-row">
    <span class="activity-marker"></span><div class="activity-copy"><strong>${index === 0 ? "Created" : "Loaded"} ${resource.name}</strong><span>${resource.service} · ${resource.type}</span></div><span class="activity-time">${resource.created}</span>
  </div>`).join("");
}

function renderOverview() {
  $("#view-container").innerHTML = `<section>
    <div class="section-heading"><h2>Resources</h2><span class="section-meta">${state.resources.length} total</span></div>
    <div class="resource-grid">${resourceCards()}</div>
    <div class="lower-grid">
      <div class="panel"><div class="section-heading"><h2>Recent activity</h2><span class="section-meta">LOCAL</span></div><div class="activity-list">${activityRows() || '<div class="empty-state">No activity yet.</div>'}</div></div>
      <div class="panel"><div class="section-heading"><h2>Quick actions</h2></div><div class="quick-list">
        <button class="quick-action" id="quick-create"><b>＋</b>Create a resource</button>
        <button class="quick-action" data-view="resources"><b>⌕</b>Browse all resources</button>
        <button class="quick-action" id="quick-endpoint"><b>⌘</b>Configure endpoint</button>
      </div></div>
    </div>
  </section>`;
  document.querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", () => selectService(button.dataset.service)));
  $("#quick-create").addEventListener("click", openModal);
  $("#quick-endpoint").addEventListener("click", configureEndpoint);
  document.querySelector("[data-view='resources']")?.addEventListener("click", () => setView("resources"));
}

function renderResources() {
  const filtered = state.service ? state.resources.filter((resource) => resource.service === state.service) : state.resources;
  const rows = filtered.map((resource) => `<tr><td>${resource.name}</td><td>${resource.service}</td><td>${resource.type}</td><td>${resource.created}</td><td><span class="status-tag">${resource.status}</span></td><td><button class="delete-button" data-delete="${resource.id}" title="Delete resource">×</button></td></tr>`).join("");
  $("#view-container").innerHTML = `<section class="table-wrap">
    <div class="table-toolbar"><input class="search-input" id="resource-search" placeholder="Search resources..." /><span class="section-meta">${state.service || "ALL SERVICES"}</span></div>
    <table class="resource-table"><thead><tr><th>Name</th><th>Service</th><th>Type</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody id="resource-rows">${rows}</tbody></table>
    ${rows ? "" : '<div class="empty-state"><strong>No resources found</strong>Create a resource to see it here.</div>'}
  </section>`;
  $("#resource-search").addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll("#resource-rows tr").forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(query); });
  });
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    const resource = state.resources.find((item) => item.id === button.dataset.delete);
    if (!resource) return;
    button.disabled = true;
    try {
      const response = await fetch(apiUrl(), { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(resource) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete the resource.");
      await loadResources();
    } catch (error) {
      button.disabled = false;
      showError(error.message);
    }
  }));
}

function renderActivity() {
  $("#view-container").innerHTML = `<div class="panel"><div class="section-heading"><h2>Activity log</h2><span class="section-meta">LOCAL SESSION</span></div><div class="activity-list">${activityRows() || '<div class="empty-state">No activity yet.</div>'}</div></div>`;
}

function render() {
  const title = state.service ? serviceMeta[state.service].label : state.view === "overview" ? "Overview" : state.view === "activity" ? "Activity" : "All resources";
  $("#page-title").textContent = title;
  $("#breadcrumb-current").textContent = title;
  $("#page-description").textContent = state.service ? `Browse and manage your local ${serviceMeta[state.service].label.toLowerCase()} resources.` : "Manage your emulated AWS resources from one place.";
  $("#endpoint-value").textContent = state.endpoint;
  if (state.view === "overview" && !state.service) renderOverview();
  else if (state.view === "activity") renderActivity();
  else renderResources();
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.view && !state.service));
  document.querySelectorAll(".service-item").forEach((item) => item.classList.toggle("active", item.dataset.service === state.service));
}

function setView(view) { state.view = view; state.service = null; render(); }
function selectService(service) { state.view = "resources"; state.service = service; render(); }
function openModal() {
  $("#modal-backdrop").classList.remove("hidden");
  $("#resource-name").focus();
  toggleEc2Fields();
}
function closeModal() {
  $("#modal-backdrop").classList.add("hidden");
  $("#form-error").textContent = "";
  $("#resource-name").value = "";
}
function toggleEc2Fields() {
  $("#ec2-fields").classList.toggle("hidden", $("#resource-service").value !== "EC2");
}
function configureEndpoint() {
  const endpoint = window.prompt("Emulator endpoint", state.endpoint);
  if (endpoint?.trim()) { state.endpoint = endpoint.trim().replace(/\/$/, ""); save(); loadResources(); }
}

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
document.querySelectorAll(".service-item").forEach((item) => item.addEventListener("click", () => selectService(item.dataset.service)));
$("#create-button").addEventListener("click", openModal);
$("#endpoint-button").addEventListener("click", configureEndpoint);
$("#modal-close").addEventListener("click", closeModal);
$("#resource-service").addEventListener("change", toggleEc2Fields);
$("#modal-backdrop").addEventListener("click", (event) => { if (event.target.id === "modal-backdrop") closeModal(); });
$("#modal-create").addEventListener("click", async () => {
  const name = $("#resource-name").value.trim();
  const service = $("#resource-service").value;
  if (!name) { $("#form-error").textContent = "Enter a resource name."; return; }
  $("#modal-create").disabled = true;
  $("#modal-create").textContent = "Creating…";
  try {
    const body = { service, name };
    if (service === "EC2") {
      body.imageId = $("#resource-image-id").value.trim();
      body.instanceType = $("#resource-instance-type").value.trim();
      if (!/^ami-[0-9a-f]+$/i.test(body.imageId)) {
        $("#form-error").textContent = "Enter a valid AMI ID, for example ami-12345678.";
        return;
      }
    }
    if (service === "SecretsManager") body.value = window.prompt("Secret value (optional)", "") || "";
    const response = await fetch(apiUrl(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not create the resource.");
    closeModal();
    await loadResources();
    selectService(service);
  } catch (error) {
    $("#form-error").textContent = error.message;
  } finally {
    $("#modal-create").disabled = false;
    $("#modal-create").textContent = "Create resource";
  }
});
$("#refresh-button").addEventListener("click", () => {
  const button = $("#refresh-button"); button.textContent = "…"; $("#connection-label").textContent = "Refreshing";
  loadResources().finally(() => { button.textContent = "↻"; });
});

render();
loadResources();
