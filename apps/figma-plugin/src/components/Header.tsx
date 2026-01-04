import { h } from 'preact';

interface HeaderProps {
  onRefresh: () => void;
  loading: boolean;
}

export function Header({ onRefresh, loading }: HeaderProps) {
  return (
    <div class="header">
      <div class="header-title">
        <span class="header-icon">🔵</span>
        <span class="header-text">Buoy</span>
      </div>
      <button
        class="refresh-button"
        onClick={onRefresh}
        disabled={loading}
        title="Refresh report"
      >
        <span class={loading ? 'spin' : ''}>↻</span>
      </button>
    </div>
  );
}
