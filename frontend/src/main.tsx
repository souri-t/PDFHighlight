import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useMatch } from 'react-router-dom';
import BorderColorRounded from '@mui/icons-material/BorderColorRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import { DocumentListPage } from './DocumentListPage';
import './styles.css';

const DocumentViewerPage = lazy(() => import('./DocumentViewerPage'));

const theme = createTheme({
  palette: {
    primary: { main: '#4338ca', dark: '#312e81' },
    background: { default: '#f4f6fa', paper: '#fff' },
    text: { primary: '#172035', secondary: '#526078' },
    divider: '#e2e7f0',
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
    button: { fontWeight: 700, textTransform: 'none' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});

function Header() {
  const inList = useMatch('/');
  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="PDF Highlight ホーム">
        <span className="brand-icon"><BorderColorRounded fontSize="small" /></span>
        PDF Highlight
      </Link>
      <nav aria-label="メイン">
        <Link to="/" className="nav-link" aria-current={inList ? 'page' : undefined}>
          <FolderOpenRounded fontSize="small" /> ドキュメント
        </Link>
      </nav>
    </header>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<DocumentListPage />} />
          <Route path="/documents/:id" element={
            <Suspense fallback={<main className="library" role="status">PDFビューアを読み込み中…</main>}>
              <DocumentViewerPage />
            </Suspense>
          } />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
