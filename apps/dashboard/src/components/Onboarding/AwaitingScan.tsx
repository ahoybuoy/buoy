import styles from './Onboarding.module.css';

export function AwaitingScan() {
  return (
    <div className={styles.container}>
      <div className={styles.progress}>
        <div className={`${styles.step} ${styles.completed}`}>✓</div>
        <div className={`${styles.stepLine} ${styles.completed}`} />
        <div className={`${styles.step} ${styles.completed}`}>✓</div>
        <div className={`${styles.stepLine} ${styles.completed}`} />
        <div className={`${styles.step} ${styles.active}`}>3</div>
      </div>

      <div className={styles.waiting}>
        <div className={styles.spinner} />
      </div>

      <h1 className={styles.title}>Waiting for First Scan</h1>

      <p className={styles.description}>
        Your repository is connected. Buoy will analyze your codebase
        when the next PR is opened or you run <code>buoy scan</code> locally.
      </p>

      <div className={styles.actions}>
        <a
          href="https://docs.buoy.design/getting-started/first-scan"
          className={styles.secondaryButton}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>📚</span>
          View Setup Guide
        </a>
      </div>

      <p className={styles.waitingText}>
        This page will refresh automatically when scan data is available.
      </p>
    </div>
  );
}
