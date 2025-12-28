export interface ScannerConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  options?: Record<string, unknown>;
}

export interface ScanError {
  file?: string;
  message: string;
  code: string;
}

export interface ScanStats {
  filesScanned: number;
  itemsFound: number;
  duration: number;
}

export interface ScanResult<T> {
  items: T[];
  errors: ScanError[];
  stats: ScanStats;
}

export abstract class Scanner<T, C extends ScannerConfig = ScannerConfig> {
  protected config: C;

  constructor(config: C) {
    this.config = config;
  }

  abstract scan(): Promise<ScanResult<T>>;
  abstract getSourceType(): string;
}
