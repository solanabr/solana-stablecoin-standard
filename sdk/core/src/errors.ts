export class FeatureDisabledError extends Error {
  public readonly feature: string;

  constructor(feature: string, message?: string) {
    super(message ?? `${feature} feature is disabled for this stablecoin`);
    this.name = 'FeatureDisabledError';
    this.feature = feature;
  }
}

export class ComplianceDisabledError extends FeatureDisabledError {
  constructor() {
    super('compliance');
    this.name = 'ComplianceDisabledError';
  }
}
