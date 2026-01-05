import styles from './Onboarding.module.css';

interface OnboardingWizardProps {
  onStartFigma?: () => void;
  onStartManual?: () => void;
}

export function OnboardingWizard({ onStartFigma, onStartManual }: OnboardingWizardProps) {
  const handleFigmaClick = () => {
    // Open Figma plugin page or trigger installation
    if (onStartFigma) {
      onStartFigma();
    } else {
      window.open('https://www.figma.com/community/plugin/buoy-design', '_blank');
    }
  };

  const handleManualClick = () => {
    if (onStartManual) {
      onStartManual();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.progress}>
        <div className={`${styles.step} ${styles.active}`}>1</div>
        <div className={styles.stepLine} />
        <div className={styles.step}>2</div>
        <div className={styles.stepLine} />
        <div className={styles.step}>3</div>
      </div>

      <div className={styles.icon}>🎨</div>

      <h1 className={styles.title}>Define Your Design Intent</h1>

      <p className={styles.description}>
        Start by telling Buoy what your design system looks like.
        We&apos;ll use this to catch when code drifts from your design patterns.
      </p>

      <div className={styles.actions}>
        <button className={styles.primaryButton} onClick={handleFigmaClick}>
          <span>🔌</span>
          Connect Figma Plugin
        </button>

        <button className={styles.secondaryButton} onClick={handleManualClick}>
          <span>✏️</span>
          Set Up Manually
        </button>
      </div>

      <a href="/docs/getting-started" className={styles.link}>
        Learn more about design intent →
      </a>
    </div>
  );
}
