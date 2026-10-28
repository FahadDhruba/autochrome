import { PROTOCOL_VERSION } from '@autochrome/shared';

export default function App() {
  return (
    <main>
      <h1>autochrome</h1>
      <p>Protocol v{PROTOCOL_VERSION}</p>
      <a href={browser.runtime.getURL('/debug.html')} target="_blank" rel="noreferrer">
        Open tool debugger
      </a>
    </main>
  );
}
