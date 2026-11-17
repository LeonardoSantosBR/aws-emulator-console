const state = {
  view: "overview",
  service: null,
  resources: [],
  endpoint: (() => {
    const stored = localStorage.getItem("emulator-endpoint");
    return !stored || stored === "http://127.0.0.1:4566"
      ? "https://127.0.0.1:9297"
      : stored;
  })(),
  loading: false,
  selectedResource: null,
};

const $ = (selector) => document.querySelector(selector);
const themeToggle = $("#theme-toggle");

function setTheme(theme, persist = true) {
  const isLight = theme === "light";
  document.documentElement.dataset.theme = isLight ? "light" : "dark";
  themeToggle.textContent = `${isLight ? "Dark" : "Light"} mode`;
  const label = `Switch to ${isLight ? "dark" : "light"} mode`;
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
  themeToggle.setAttribute("aria-pressed", String(isLight));
  document.querySelector('meta[name="theme-color"]').content = isLight
    ? "#f4f7fa"
    : "#0b0f14";
  if (persist) {
    try {
      localStorage.setItem("emulator-theme", isLight ? "light" : "dark");
    } catch {}
  }
}

setTheme(document.documentElement.dataset.theme || "dark", false);
themeToggle.addEventListener("click", () => {
  setTheme(
    document.documentElement.dataset.theme === "light" ? "dark" : "light"
  );
});

const serviceMeta = {
  S3: {
    label: "Simple Storage",
    icon: "amazon-aws-S3-icon.svg",
    className: "badge-s3",
  },
  DynamoDB: {
    label: "DynamoDB",
    icon: "amazon-aws-DynamoDb-icon.svg",
    className: "badge-dynamo",
  },
  SQS: {
    label: "Queue Service",
    icon: "amazon-aws-Sqs-icon.svg",
    className: "badge-sqs",
  },
  SNS: {
    label: "Notifications",
    icon: "amazon-aws-Sns-icon.svg",
    className: "badge-sns",
  },
  EventBridge: {
    label: "EventBridge",
    icon: "amazon-aws-EventBridge-icon.svg",
    className: "badge-eventbridge",
  },
  CloudWatchLogs: {
    label: "CloudWatch Logs",
    icon: "amazon-aws-CloudWatch-icon.svg",
    className: "badge-logs",
  },
  SecretsManager: {
    label: "Secrets Manager",
    icon: "amazon-aws-SecretsManager.svg",
    className: "badge-secrets",
  },
  EC2: {
    label: "Elastic Compute Cloud",
    icon: "amazon-aws-Ec2-icon.svg",
    className: "badge-ec2",
  },
  Lambda: {
    label: "Lambda",
    icon: "amazon-aws-Lambda-icon.svg",
    className: "badge-lambda",
  },
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
    if (!response.ok)
      throw new Error(payload.error || "Could not reach the emulator.");
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
  return Object.entries(serviceMeta)
    .map(([service, meta]) => {
      const count = state.resources.filter(
        (resource) => resource.service === service
      ).length;
      return `<button class="resource-card" data-service="${service}">
      <div class="resource-card-top"><span class="service-badge ${meta.className}"><img src="assets/${meta.icon}" alt="" /></span><span class="resource-count">${count}</span></div>
      <h3>${meta.label}</h3><p>${service} resources</p>
    </button>`;
    })
    .join("");
}

function activityRows() {
  const recent = state.resources.slice(-4).reverse();
  return recent
    .map(
      (resource, index) => `<div class="activity-row">
    <span class="activity-marker"></span><div class="activity-copy"><strong>${
      index === 0 ? "Created" : "Loaded"
    } ${resource.name}</strong><span>${resource.service} · ${
        resource.type
      }</span></div><span class="activity-time">${resource.created}</span>
  </div>`
    )
    .join("");
}

function renderOverview() {
  $("#view-container").innerHTML = `<section>
    <div class="section-heading"><h2>Resources</h2><span class="section-meta">${
      state.resources.length
    } total</span></div>
    <div class="resource-grid">${resourceCards()}</div>
    <div class="lower-grid">
      <div class="panel"><div class="section-heading"><h2>Recent activity</h2><span class="section-meta">LOCAL</span></div><div class="activity-list">${
        activityRows() || '<div class="empty-state">No activity yet.</div>'
      }</div></div>
      <div class="panel"><div class="section-heading"><h2>Quick actions</h2></div><div class="quick-list">
        <button class="quick-action" id="quick-create"><b>＋</b>Create a resource</button>
        <button class="quick-action" data-view="resources"><b>⌕</b>Browse all resources</button>
        <button class="quick-action" id="quick-endpoint"><b>⌘</b>Configure endpoint</button>
      </div></div>
    </div>
  </section>`;
  document
    .querySelectorAll("[data-service]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        selectService(button.dataset.service)
      )
    );
  $("#quick-create").addEventListener("click", openModal);
  $("#quick-endpoint").addEventListener("click", configureEndpoint);
  document
    .querySelector("[data-view='resources']")
    ?.addEventListener("click", () => setView("resources"));
}

function renderResources() {
  const filtered = state.service
    ? state.resources.filter((resource) => resource.service === state.service)
    : state.resources;
  const rows = filtered
    .map(
      (resource) =>
        `<tr class="resource-row" data-open="${resource.id}"><td>${resource.name}</td><td>${resource.service}</td><td>${resource.type}</td><td>${resource.created}</td><td><span class="status-tag">${resource.status}</span></td><td><button class="delete-button" data-delete="${resource.id}" title="Delete resource">×</button></td></tr>`
    )
    .join("");
  $("#view-container").innerHTML = `<section class="table-wrap">
    <div class="table-toolbar"><input class="search-input" id="resource-search" placeholder="Search resources..." /></div>
    <table class="resource-table"><thead><tr><th>Name</th><th>Service</th><th>Type</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody id="resource-rows">${rows}</tbody></table>
    ${
      rows
        ? ""
        : '<div class="empty-state"><strong>No resources found</strong>Create a resource to see it here.</div>'
    }
  </section>`;
  $("#resource-search").addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll("#resource-rows tr").forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
  });
  document.querySelectorAll("[data-open]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    state.selectedResource = state.resources.find((item) => item.id === row.dataset.open);
    renderResourceDetail();
  }));
  document.querySelectorAll("[data-delete]").forEach((button) =>
    button.addEventListener("click", async () => {
      const resource = state.resources.find(
        (item) => item.id === button.dataset.delete
      );
      if (!resource) return;
      button.disabled = true;
      try {
        const response = await fetch(apiUrl(), {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(resource),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Could not delete the resource.");
        await loadResources();
      } catch (error) {
        button.disabled = false;
        showError(error.message);
      }
    })
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderResourceDetail() {
  const resource = state.selectedResource;
  if (!resource) return renderResources();
  const actions = {
    S3: `<div class="detail-actions"><label class="field-label" for="detail-file">Upload a file</label><input id="detail-file" type="file"/><button class="secondary-button" data-action="s3-upload">Upload selected file</button><span class="form-hint" id="upload-hint">The file name will be used as the object key.</span><label class="field-label" for="detail-key">Or create a text object</label><input id="detail-key" placeholder="Object key"/><textarea id="detail-content" placeholder="Object content"></textarea><button class="secondary-button" data-action="s3-put">Upload text object</button><button class="secondary-button" data-action="s3-list">Refresh objects</button></div><div id="detail-result"></div>`,
    DynamoDB: `<div class="detail-actions"><input id="detail-key" placeholder="id (partition key)"/><textarea id="detail-content" placeholder="value"></textarea><button class="secondary-button" data-action="ddb-put">Save item</button><button class="secondary-button" data-action="ddb-list">Scan table</button></div><div id="detail-result"></div>`,
    SQS: `<div class="detail-actions"><textarea id="detail-content" placeholder="Message body"></textarea><button class="secondary-button" data-action="sqs-send">Send message</button><button class="secondary-button" data-action="sqs-receive">Receive messages</button></div><div id="detail-result"></div>`,
    SNS: `<div class="detail-actions"><textarea id="detail-content" placeholder="Message"></textarea><button class="secondary-button" data-action="sns-publish">Publish message</button></div><div id="detail-result"></div>`,
    SecretsManager: `<div class="detail-actions"><button class="secondary-button" data-action="secret-read">Reveal secret value</button></div><div id="detail-result"></div>`,
  };
  const props = Object.entries(resource).filter(([key]) => !["id", "service", "name", "type", "status"].includes(key)).map(([key, value]) => `<div class="detail-property"><span>${escapeHtml(key)}</span><code>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</code></div>`).join("");
  $("#view-container").innerHTML = `<section class="panel resource-detail"><button class="detail-back" id="detail-back">← Back to resources</button><div class="section-heading"><div><span class="section-meta">${escapeHtml(resource.service)} · ${escapeHtml(resource.type)}</span><h2>${escapeHtml(resource.name)}</h2></div><button class="delete-button" data-detail-delete="${escapeHtml(resource.id)}" title="Delete resource">×</button></div><div class="detail-properties">${props}</div>${actions[resource.service] || '<div class="empty-state">This resource is ready. Interactive operations are not available for this service yet.</div>'}</section>`;
  $("#detail-back").addEventListener("click", () => { state.selectedResource = null; renderResources(); });
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => runResourceAction(button.dataset.action)));
  $("[data-detail-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${resource.name}?`)) return;
    try { await deleteSelectedResource(resource); } catch (error) { showError(error.message); }
  });
}

async function runResourceAction(action) {
  const resource = state.selectedResource;
  const resultBox = $("#detail-result");
  const key = $("#detail-key")?.value || "";
  const content = $("#detail-content")?.value || "";
  const actionBody = { action, service: resource.service, name: resource.name, url: resource.url, arn: resource.arn, key, content };
  try {
    if (action === "s3-upload") {
      const file = $("#detail-file").files?.[0];
      if (!file) throw new Error("Choose a file to upload.");
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      await postResourceAction({ ...actionBody, action, key: file.name, content: base64, contentType: file.type || "application/octet-stream" });
      $("#upload-hint").textContent = `Uploaded ${file.name} (${formatBytes(file.size)}).`;
      $("#detail-file").value = "";
      return runResourceAction("s3-list");
    }
    if (action === "s3-put" && !key) throw new Error("Enter an object key.");
    if (action === "ddb-put" && !key) throw new Error("Enter the partition key.");
    const response = await fetch(`/api/resource-action?endpoint=${encodeURIComponent(state.endpoint)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(actionBody) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Operation failed.");
    if (action === "s3-list") resultBox.innerHTML = `<div class="objects-heading"><h3>Objects</h3><span>${payload.items.length} total</span></div>${payload.items.length ? `<div class="object-list">${payload.items.map((item, index) => `<article class="object-card"><div class="object-row"><span class="object-name" title="${escapeHtml(item.key)}">${escapeHtml(item.key)}</span><span class="object-size">${formatBytes(item.size)}</span><button class="secondary-button" data-object-get="${index}">View</button><button class="delete-button" data-object-delete="${index}" title="Delete object">×</button></div><div class="object-preview hidden" id="object-preview-${index}"></div></article>`).join("")}</div>` : '<div class="empty-state">Bucket is empty.</div>'}`;
    else if (action === "ddb-list") resultBox.innerHTML = `<h3>Items</h3><pre>${escapeHtml(JSON.stringify(payload.items, null, 2))}</pre>`;
    else if (action === "sqs-receive") resultBox.innerHTML = `<h3>Messages</h3>${payload.messages.length ? payload.messages.map((message) => `<div class="detail-message"><pre>${escapeHtml(message.Body)}</pre><button class="secondary-button" data-message-delete="${escapeHtml(message.ReceiptHandle)}">Delete message</button></div>`).join("") : '<div class="empty-state">No messages available.</div>'}`;
    else if (action === "secret-read") resultBox.innerHTML = `<h3>Secret value</h3><pre>${escapeHtml(payload.value)}</pre>`;
    else resultBox.innerHTML = '<p class="operation-success">Operation completed.</p>';
    resultBox.querySelectorAll("[data-object-get]").forEach((button) => button.addEventListener("click", async () => {
      const preview = $(`#object-preview-${button.dataset.objectGet}`);
      if (button.dataset.loaded === "true") {
        const isHidden = preview.classList.toggle("hidden");
        button.textContent = isHidden ? "View" : "Hide";
        return;
      }
      const item = payload.items[Number(button.dataset.objectGet)];
      button.disabled = true; button.textContent = "Loading…";
      try {
        const p = await postResourceAction({ action: "s3-get", service: resource.service, name: resource.name, key: item.key });
        preview.innerHTML = `<pre>${escapeHtml(p.content)}</pre>`;
        preview.classList.remove("hidden");
        button.dataset.loaded = "true";
        button.textContent = "Hide";
      } catch (error) {
        preview.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`;
        preview.classList.remove("hidden");
        button.textContent = "View";
      } finally { button.disabled = false; }
    }));
    resultBox.querySelectorAll("[data-object-delete]").forEach((button) => button.addEventListener("click", async () => { const item = payload.items[Number(button.dataset.objectDelete)]; if (!confirm(`Delete object ${item.key}?`)) return; try { await postResourceAction({ action: "s3-delete", service: resource.service, name: resource.name, key: item.key }); runResourceAction("s3-list"); } catch (error) { resultBox.insertAdjacentHTML("afterbegin", `<p class="form-error">${escapeHtml(error.message)}</p>`); } }));
    resultBox.querySelectorAll("[data-message-delete]").forEach((button) => button.addEventListener("click", async () => { await postResourceAction({ action: "sqs-delete", service: resource.service, name: resource.name, url: resource.url, receiptHandle: button.dataset.messageDelete }); runResourceAction("sqs-receive"); }));
  } catch (error) { resultBox.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function postResourceAction(body) {
  const response = await fetch(`/api/resource-action?endpoint=${encodeURIComponent(state.endpoint)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Operation failed.");
  return payload;
}

async function deleteSelectedResource(resource) {
  const response = await fetch(apiUrl(), { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(resource) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not delete resource.");
  state.selectedResource = null;
  await loadResources();
}

function renderActivity() {
  $(
    "#view-container"
  ).innerHTML = `<div class="panel"><div class="section-heading"><h2>Activity log</h2><span class="section-meta">LOCAL SESSION</span></div><div class="activity-list">${
    activityRows() || '<div class="empty-state">No activity yet.</div>'
  }</div></div>`;
}

function render() {
  const title = state.service
    ? serviceMeta[state.service].label
    : state.view === "overview"
    ? "Overview"
    : state.view === "activity"
    ? "Activity"
    : "All resources";
  $("#page-title").textContent = title;
  $("#breadcrumb-current").textContent = title;
  $("#page-description").textContent = state.service
    ? `Browse and manage your local ${serviceMeta[
        state.service
      ].label.toLowerCase()} resources.`
    : "Manage your emulated AWS resources from one place.";
  $("#endpoint-value").textContent = state.endpoint;
  if (state.view === "overview" && !state.service) renderOverview();
  else if (state.view === "activity") renderActivity();
  else if (state.selectedResource) renderResourceDetail();
  else renderResources();
  document
    .querySelectorAll(".nav-item")
    .forEach((item) =>
      item.classList.toggle(
        "active",
        item.dataset.view === state.view && !state.service
      )
    );
  document
    .querySelectorAll(".service-item")
    .forEach((item) =>
      item.classList.toggle("active", item.dataset.service === state.service)
    );
}

function setView(view) {
  state.view = view;
  state.service = null;
  state.selectedResource = null;
  render();
}
function selectService(service) {
  state.view = "resources";
  state.service = service;
  state.selectedResource = null;
  render();
}
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
  $("#ec2-fields").classList.toggle(
    "hidden",
    $("#resource-service").value !== "EC2"
  );
}
function configureEndpoint() {
  const endpoint = window.prompt("Emulator endpoint", state.endpoint);
  if (endpoint?.trim()) {
    state.endpoint = endpoint.trim().replace(/\/$/, "");
    save();
    loadResources();
  }
}

document
  .querySelectorAll(".nav-item")
  .forEach((item) =>
    item.addEventListener("click", () => setView(item.dataset.view))
  );
document
  .querySelectorAll(".service-item")
  .forEach((item) =>
    item.addEventListener("click", () => selectService(item.dataset.service))
  );
$("#create-button").addEventListener("click", openModal);
$("#endpoint-button").addEventListener("click", configureEndpoint);
$("#modal-close").addEventListener("click", closeModal);
$("#resource-service").addEventListener("change", toggleEc2Fields);
$("#modal-backdrop").addEventListener("click", (event) => {
  if (event.target.id === "modal-backdrop") closeModal();
});
$("#modal-create").addEventListener("click", async () => {
  const name = $("#resource-name").value.trim();
  const service = $("#resource-service").value;
  if (!name) {
    $("#form-error").textContent = "Enter a resource name.";
    return;
  }
  $("#modal-create").disabled = true;
  $("#modal-create").textContent = "Creating…";
  try {
    const body = { service, name };
    if (service === "EC2") {
      body.imageId = $("#resource-image-id").value.trim();
      body.instanceType = $("#resource-instance-type").value.trim();
      if (!/^ami-[0-9a-f]+$/i.test(body.imageId)) {
        $("#form-error").textContent =
          "Enter a valid AMI ID, for example ami-12345678.";
        return;
      }
    }
    if (service === "SecretsManager")
      body.value = window.prompt("Secret value (optional)", "") || "";
    const response = await fetch(apiUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "Could not create the resource.");
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
  const button = $("#refresh-button");
  button.textContent = "…";
  $("#connection-label").textContent = "Refreshing";
  loadResources().finally(() => {
    button.textContent = "↻";
  });
});

render();
loadResources();
