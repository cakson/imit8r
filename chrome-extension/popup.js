const endpointInput = document.getElementById('endpoint');
const loadBtn = document.getElementById('load');
const fieldsDiv = document.getElementById('fields');
const applyBtn = document.getElementById('apply');
const schemaFileInput = document.getElementById('schemaFile');

// Fetch the active tab URL to guess the GraphQL endpoint
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = new URL(tabs[0].url);
  endpointInput.value = `${url.origin}/graphql`;
});

loadBtn.addEventListener('click', async () => {
  fieldsDiv.textContent = 'Loading...';
  try {
    const res = await fetch(endpointInput.value, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: introspectionQuery })
    });
    const json = await res.json();
    renderFields(json.data.__schema);
  } catch (e) {
    fieldsDiv.textContent = 'Failed to load schema';
  }
});

// Load schema from uploaded file
schemaFileInput.addEventListener('change', () => {
  const file = schemaFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      const schema = json.data ? json.data.__schema : json.__schema;
      if (schema) {
        renderFields(schema);
      } else {
        fieldsDiv.textContent = 'Invalid schema file';
      }
    } catch {
      fieldsDiv.textContent = 'Invalid schema file';
    }
  };
  reader.readAsText(file);
});

applyBtn.addEventListener('click', () => {
  const config = {};
  document.querySelectorAll('.field').forEach(div => {
    const type = div.dataset.type;
    const field = div.dataset.field;
    const value = parseInt(div.querySelector('input').value, 10);
    if (!config[type]) config[type] = {};
    config[type][field] = value;
  });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    chrome.cookies.set({
      url: url.origin,
      name: 'mock_config',
      value: JSON.stringify(config),
      path: '/'
    });
  });
});

const introspectionQuery = `
  query { __schema { queryType { name fields { name } } mutationType { name fields { name } } } }
`;

function renderFields(schema) {
  fieldsDiv.textContent = '';
  ['queryType', 'mutationType'].forEach(key => {
    const type = schema[key];
    if (!type) return;
    const h3 = document.createElement('h3');
    h3.textContent = type.name;
    fieldsDiv.appendChild(h3);
    type.fields.forEach(f => {
      const div = document.createElement('div');
      div.className = 'field';
      div.dataset.type = type.name;
      div.dataset.field = f.name;
      div.innerHTML = `${f.name}: <input type="number" value="0" />`;
      fieldsDiv.appendChild(div);
    });
  });
}
