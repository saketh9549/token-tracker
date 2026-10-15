import { createRoot } from 'react-dom/client';
import { App } from '@promptpulse/ui';
import { BrowserStore } from '@promptpulse/storage';
import '@promptpulse/ui/styles.css';
createRoot(document.getElementById('root')!).render(<App store={new BrowserStore()} />);
