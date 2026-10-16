import { createRoot } from 'react-dom/client';
import { Popup } from '../../src/popup/view';
import '../../src/popup/style.css';

document.documentElement.dataset.view = new URLSearchParams(location.search).get('view') === 'drawer' ? 'drawer' : 'page';
createRoot(document.getElementById('root')!).render(<Popup />);
