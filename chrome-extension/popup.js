// Parse a very simple subset of GraphQL schema syntax to extract types and fields.
function parseSchema(text) {
  const typeRegex = /type\s+(\w+)\s*{([\s\S]*?)}/g;
  const result = {};
  let match;
  while ((match = typeRegex.exec(text))) {
    const typeName = match[1];
    const body = match[2];
    const fields = [];
    const fieldRegex = /(\w+)\s*(?:\([^)]*\))?\s*:/g;
    let f;
    while ((f = fieldRegex.exec(body))) {
      fields.push(f[1]);
    }
    result[typeName] = fields;
  }
  return result;
}

// Generate form inputs based on the parsed schema.
function renderForm(schema, saved = {}) {
  const container = document.getElementById('formContainer');
  container.innerHTML = '';
  Object.entries(schema).forEach(([type, fields]) => {
    const typeHeader = document.createElement('div');
    typeHeader.textContent = type;
    typeHeader.className = 'type';
    container.appendChild(typeHeader);

    // Type level input
    const typeDiv = document.createElement('div');
    typeDiv.className = 'field';
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'variant:';
    const typeInput = document.createElement('input');
    typeInput.type = 'number';
    const savedType = saved[type];
    if (typeof savedType === 'number') {
      typeInput.value = String(savedType);
    } else {
      typeInput.value = '0';
    }
    typeInput.dataset.path = type;
    typeDiv.appendChild(typeLabel);
    typeDiv.appendChild(typeInput);
    container.appendChild(typeDiv);
    typeInput.addEventListener('input', saveConfig);

    fields.forEach(field => {
      const div = document.createElement('div');
      div.className = 'field';
      const label = document.createElement('label');
      label.textContent = `${field}:`;
      const input = document.createElement('input');
      input.type = 'number';
      const savedField =
        typeof savedType === 'object' ? savedType[field] : undefined;
      if (typeof savedField === 'number') {
        input.value = String(savedField);
      } else {
        input.value = '0';
      }
      input.dataset.path = `${type}.${field}`;
      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);
      input.addEventListener('input', saveConfig);
    });
  });
  updateJsonPreview();
}

function getConfig() {
  const config = {};
  const inputs = document.querySelectorAll('#formContainer input');
  inputs.forEach(input => {
    const path = input.dataset.path;
    const value = parseInt(input.value, 10);
    if (isNaN(value)) return;
    const parts = path.split('.');
    if (parts.length === 1) {
      config[parts[0]] = value;
    } else {
      config[parts[0]] = config[parts[0]] || {};
      config[parts[0]][parts[1]] = value;
    }
  });
  return config;
}

function updateJsonPreview() {
  const pre = document.getElementById('jsonOutput');
  if (pre) {
    pre.textContent = JSON.stringify(getConfig(), null, 2);
  }
}

function saveConfig() {
  const config = getConfig();
  chrome.storage.local.set({ config });
  updateJsonPreview();
}

function setCookie(config) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs.length) return;
    const url = new URL(tabs[0].url);
    chrome.cookies.set({
      url: url.origin,
      name: 'mock_config',
      value: JSON.stringify(config)
    });
  });
}

document.getElementById('schemaFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    const schema = parseSchema(text);
    renderForm(schema);
    chrome.storage.local.set({ schemaText: text, config: getConfig() });
  };
  reader.readAsText(file);
});

document.getElementById('applyBtn').addEventListener('click', () => {
  const config = getConfig();
  chrome.storage.local.set({ config });
  setCookie(config);
  updateJsonPreview();
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['schemaText', 'config'], data => {
    if (data.schemaText) {
      const schema = parseSchema(data.schemaText);
      renderForm(schema, data.config || {});
    }
    updateJsonPreview();
  });
  document.getElementById('copyBtn').addEventListener('click', () => {
    const text = document.getElementById('jsonOutput').textContent;
    navigator.clipboard.writeText(text);
  });
});
