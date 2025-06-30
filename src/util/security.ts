export class SecurityScheme {
  public name: string;
  public scheme: SecuritySchemeData;

  public constructor(name: string, scheme: SecuritySchemeData) {
    this.name = name;
    this.scheme = scheme;
  }
}

type SecuritySchemeData =
  | {
      type: 'http';
      scheme: 'basic' | 'bearer';
    }
  | {
      type: 'apiKey';
      in: 'header' | 'query' | 'cookie';
      name: string;
    };
