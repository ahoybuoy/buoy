import { useState } from 'react';
import type { DesignIntent } from '../../types';
import styles from './Onboarding.module.css';

interface ConnectRepoProps {
  designIntent: DesignIntent;
  inviteUrl?: string;
}

export function ConnectRepo({ designIntent, inviteUrl }: ConnectRepoProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tokenCount = designIntent.tokens?.length || 0;
  const componentCount = designIntent.components?.length || 0;
  const categoriesEnabled = Object.values(designIntent.trackingCategories || {}).filter(Boolean).length;

  return (
    <div className={styles.container}>
      <div className={styles.progress}>
        <div className={`${styles.step} ${styles.completed}`}>✓</div>
        <div className={`${styles.stepLine} ${styles.completed}`} />
        <div className={`${styles.step} ${styles.active}`}>2</div>
        <div className={styles.stepLine} />
        <div className={styles.step}>3</div>
      </div>

      <div className={styles.icon}>🔗</div>

      <h1 className={styles.title}>Connect Your Repository</h1>

      <p className={styles.description}>
        Your design intent is ready! Now invite a developer to connect
        your GitHub repository so Buoy can start watching for drift.
      </p>

      <div className={styles.statsPreview}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{tokenCount}</div>
          <div className={styles.statLabel}>Tokens</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{componentCount}</div>
          <div className={styles.statLabel}>Components</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{categoriesEnabled}</div>
          <div className={styles.statLabel}>Categories</div>
        </div>
      </div>

      <div className={styles.inviteCard}>
        <h3 className={styles.inviteTitle}>Invite a Developer</h3>
        <p className={styles.inviteDescription}>
          Share this link with a developer who has access to your codebase.
        </p>
        {inviteUrl ? (
          <div className={styles.copyLink}>
            <input
              type="text"
              className={styles.copyInput}
              value={inviteUrl}
              readOnly
            />
            <button className={styles.copyButton} onClick={handleCopyLink}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        ) : (
          <button className={styles.primaryButton}>
            Generate Invite Link
          </button>
        )}
      </div>
    </div>
  );
}
