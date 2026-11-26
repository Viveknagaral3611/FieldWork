const form = document.querySelector('#open');
const statusLine = document.querySelector('#status');
const workspace = document.querySelector('#workspace');
const submit = form.querySelector('button');
const supported = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com']);
let board;

async function setup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    const url = new URL(tab.url);
    if (url.hostname === 'jobright.ai' || url.hostname.endsWith('.jobright.ai')) {
      statusLine.textContent = 'Open a job on Jobright, then open the employer’s application page. Run FieldWork from that tab if it is on Greenhouse, Lever, or Ashby.';
      return;
    }
    const slug = url.pathname.split('/').filter(Boolean)[0];
    if (url.protocol === 'https:' && supported.has(url.hostname) && /^[a-z0-9_-]{1,100}$/i.test(slug || '')) {
      board = new URL('/' + slug, url.origin).href;
    }
  }
  if (!board) {
    statusLine.textContent = 'Open an employer board on Greenhouse, Lever, or Ashby.';
    return;
  }
  const saved = await chrome.storage.local.get('workspace');
  workspace.value = saved.workspace || workspace.value;
  statusLine.textContent = 'Ready to search ' + new URL(board).hostname + new URL(board).pathname;
  submit.disabled = false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!board) return;
  try {
    const target = new URL(workspace.value);
    const local = ['http:', 'https:'].includes(target.protocol) && ['localhost', '127.0.0.1'].includes(target.hostname);
    const codespaces = target.protocol === 'https:' && target.hostname.endsWith('.app.github.dev');
    if (!(local || codespaces) || target.username || target.password) {
      statusLine.textContent = 'Enter your local FieldWork address or its HTTPS Codespaces forwarded URL.';
      return;
    }
    await chrome.storage.local.set({ workspace: target.origin });
    const link = new URL('/', target.origin);
    link.hash = 'chrome?' + new URLSearchParams({ board });
    await chrome.tabs.create({ url: link.href });
    window.close();
  } catch {
    statusLine.textContent = 'Could not open FieldWork. Check its address and try again.';
  }
});

setup().catch(() => { statusLine.textContent = 'Could not read the active tab.'; });
