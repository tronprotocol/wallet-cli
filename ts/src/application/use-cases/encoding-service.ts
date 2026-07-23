import { convertEncoding } from "../../domain/encoding/index.js";

export class EncodingService {
  convert(input: string) {
    return convertEncoding(input);
  }
}
