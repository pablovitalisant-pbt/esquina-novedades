/** Error HTTP compartido por las llamadas de API. */
export class ErrorApi extends Error {
  constructor(message: string, name = 'ErrorApi') {
    super(message);
    this.name = name;
  }
}
