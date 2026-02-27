export interface SssToken {
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
  };
  instructions: any[];
  accounts: any[];
  types: any[];
}
