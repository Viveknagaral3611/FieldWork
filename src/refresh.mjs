import { openStore } from './store.mjs';
import { refreshAll } from './sources.mjs';
import { installStarterBoards } from './discovery.mjs';
import { accountsFor } from './accounts.mjs';

const baseStore = openStore(undefined, { starterProfile: false });
installStarterBoards(baseStore);
const accounts = accountsFor(baseStore);
try {
  const workspaces = accounts.list().map(account => accounts.workspace(account));
  for (const store of workspaces.length ? workspaces : [baseStore]) {
    const result = await refreshAll(store);
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
  }
} finally {
  accounts.close();
}
