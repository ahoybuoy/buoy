import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { fetchReport } from './api';
import type { ReportResponse } from './types';
import { Header } from './components/Header';
import { Summary } from './components/Summary';
import { IssueList } from './components/IssueList';

function App() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReport();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  return (
    <div class="app">
      <Header onRefresh={loadReport} loading={loading} />

      {loading && !report && (
        <div class="loading">
          <div class="spinner" />
          <span>Loading report...</span>
        </div>
      )}

      {error && (
        <div class="error">
          <span class="error-icon">⚠️</span>
          <span class="error-message">{error}</span>
          <button class="retry-button" onClick={loadReport}>
            Try again
          </button>
        </div>
      )}

      {report && (
        <>
          <Summary summary={report.summary} generatedAt={report.generatedAt} />
          <IssueList issues={report.issues} />
        </>
      )}
    </div>
  );
}

render(<App />, document.getElementById('root')!);
