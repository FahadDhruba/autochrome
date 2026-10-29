import { afterEach, describe, expect, it } from 'vitest';
import { createLink, type Link } from './link';
import { TEST_TOKEN, connectFakeExtension, echoResult, startTestHub, waitFor } from './testUtils';

const links: Link[] = [];
afterEach(async () => {
  await Promise.all(links.splice(0).map((link) => link.close()));
});

const makeLink = (port: number, token = TEST_TOKEN) => {
  const link = createLink({
    port,
    token,
    retryMs: 20,
    connectTimeoutMs: 5000,
    extensionGraceMs: 0,
  });
  links.push(link);
  return link;
};

describe('createLink', () => {
  it('forwards calls to an existing hub', async () => {
    const hub = await startTestHub();
    const extension = await connectFakeExtension(hub.port, echoResult);
    const link = makeLink(hub.port);

    const result = await link.call('find', { query: 'x' });
    expect(result).toMatchObject({ ok: true, content: [{ text: 'find:{"query":"x"}' }] });
    expect(extension.calls).toHaveLength(1);

    extension.close();
    await link.close();
    links.length = 0;
    await hub.close();
  });

  it('becomes the hub when none is listening', async () => {
    // Find a free port by binding and releasing it.
    const probe = await startTestHub();
    const { port } = probe;
    await probe.close();

    const link = makeLink(port);
    const result = await link.call('tabs_list', {});
    expect(result.ok).toBe(false); // the new hub is up, but no extension is connected
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('not connected') });
  });

  it('takes over when the hub exits', async () => {
    const hub = await startTestHub();
    const { port } = hub;
    const link = makeLink(port);
    await link.call('tabs_list', {}); // connected to the first hub

    await hub.close();
    // The link notices, binds the port itself and serves a new extension connection.
    let extension: Awaited<ReturnType<typeof connectFakeExtension>> | undefined;
    await waitFor(async () => {
      try {
        extension = await connectFakeExtension(port, echoResult);
        return true;
      } catch {
        return false;
      }
    });
    const result = await link.call('tabs_list', {});
    expect(result.ok).toBe(true);
    extension?.close();
  });

  it('reports a rejected token instead of retrying forever', async () => {
    const hub = await startTestHub();
    const link = makeLink(hub.port, 'wrong-token');
    const result = await link.call('tabs_list', {});
    expect(result.ok).toBe(false);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('rejected the token'),
    });
    await link.close();
    links.length = 0;
    await hub.close();
  });
});
