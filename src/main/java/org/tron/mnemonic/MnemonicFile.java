package org.tron.mnemonic;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;

public class MnemonicFile {
  private String address;
  private MnemonicFile.Crypto crypto;
  private String id;
  private int version;

  public MnemonicFile() {
  }

  public String getAddress() {
    return address;
  }

  public void setAddress(String address) {
    this.address = address;
  }

  public MnemonicFile.Crypto getCrypto() {
    return crypto;
  }

  @JsonSetter("crypto")
  public void setCrypto(MnemonicFile.Crypto crypto) {
    this.crypto = crypto;
  }

  @JsonSetter("Crypto")
  public void setCryptoV1(MnemonicFile.Crypto crypto) {
    setCrypto(crypto);
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public int getVersion() {
    return version;
  }

  public void setVersion(int version) {
    this.version = version;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (!(o instanceof MnemonicFile)) {
      return false;
    }

    MnemonicFile that = (MnemonicFile) o;

    if (getAddress() != null
        ? !getAddress().equals(that.getAddress())
        : that.getAddress() != null) {
      return false;
    }
    if (getCrypto() != null
        ? !getCrypto().equals(that.getCrypto())
        : that.getCrypto() != null) {
      return false;
    }
    if (getId() != null
        ? !getId().equals(that.getId())
        : that.getId() != null) {
      return false;
    }
    return version == that.version;
  }

  @Override
  public int hashCode() {
    int result = getAddress() != null ? getAddress().hashCode() : 0;
    result = 31 * result + (getCrypto() != null ? getCrypto().hashCode() : 0);
    result = 31 * result + (getId() != null ? getId().hashCode() : 0);
    result = 31 * result + version;
    return result;
  }

  public static class Crypto {
    private String cipher;
    private String ciphertext;
    private MnemonicFile.CipherParams cipherparams;

    private String kdf;
    private MnemonicFile.KdfParams kdfparams;

    private String mac;

    public Crypto() {
    }

    public String getCipher() {
      return cipher;
    }

    public void setCipher(String cipher) {
      this.cipher = cipher;
    }

    public String getCiphertext() {
      return ciphertext;
    }

    public void setCiphertext(String ciphertext) {
      this.ciphertext = ciphertext;
    }

    public MnemonicFile.CipherParams getCipherparams() {
      return cipherparams;
    }

    public void setCipherparams(MnemonicFile.CipherParams cipherparams) {
      this.cipherparams = cipherparams;
    }

    public String getKdf() {
      return kdf;
    }

    public void setKdf(String kdf) {
      this.kdf = kdf;
    }

    public MnemonicFile.KdfParams getKdfparams() {
      return kdfparams;
    }

    @JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.EXTERNAL_PROPERTY,
        property = "kdf")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = MnemonicFile.Aes128CtrKdfParams.class, name = Mnemonic.AES_128_CTR),
        @JsonSubTypes.Type(value = MnemonicFile.ScryptKdfParams.class, name = Mnemonic.SCRYPT)
    })

    public void setKdfparams(MnemonicFile.KdfParams kdfparams) {
      this.kdfparams = kdfparams;
    }

    public String getMac() {
      return mac;
    }

    public void setMac(String mac) {
      this.mac = mac;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) {
        return true;
      }
      if (!(o instanceof MnemonicFile.Crypto)) {
        return false;
      }

      MnemonicFile.Crypto that = (MnemonicFile.Crypto) o;

      if (getCipher() != null
          ? !getCipher().equals(that.getCipher())
          : that.getCipher() != null) {
        return false;
      }
      if (getCiphertext() != null
          ? !getCiphertext().equals(that.getCiphertext())
          : that.getCiphertext() != null) {
        return false;
      }
      if (getCipherparams() != null
          ? !getCipherparams().equals(that.getCipherparams())
          : that.getCipherparams() != null) {
        return false;
      }
      if (getKdf() != null
          ? !getKdf().equals(that.getKdf())
          : that.getKdf() != null) {
        return false;
      }
      if (getKdfparams() != null
          ? !getKdfparams().equals(that.getKdfparams())
          : that.getKdfparams() != null) {
        return false;
      }
      return getMac() != null
          ? getMac().equals(that.getMac()) : that.getMac() == null;
    }

    @Override
    public int hashCode() {
      int result = getCipher() != null ? getCipher().hashCode() : 0;
      result = 31 * result + (getCiphertext() != null ? getCiphertext().hashCode() : 0);
      result = 31 * result + (getCipherparams() != null ? getCipherparams().hashCode() : 0);
      result = 31 * result + (getKdf() != null ? getKdf().hashCode() : 0);
      result = 31 * result + (getKdfparams() != null ? getKdfparams().hashCode() : 0);
      result = 31 * result + (getMac() != null ? getMac().hashCode() : 0);
      return result;
    }

  }

  public static class CipherParams {
    private String iv;

    public CipherParams() {
    }

    public String getIv() {
      return iv;
    }

    public void setIv(String iv) {
      this.iv = iv;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) {
        return true;
      }
      if (!(o instanceof MnemonicFile.CipherParams)) {
        return false;
      }

      MnemonicFile.CipherParams that = (MnemonicFile.CipherParams) o;

      return getIv() != null
          ? getIv().equals(that.getIv()) : that.getIv() == null;
    }

    @Override
    public int hashCode() {
      int result = getIv() != null ? getIv().hashCode() : 0;
      return result;
    }

  }

  interface KdfParams {
    int getDklen();

    String getSalt();
  }

  public static class Aes128CtrKdfParams implements MnemonicFile.KdfParams {
    private int dklen;
    private int c;
    private String prf;
    private String salt;

    public Aes128CtrKdfParams() {
    }

    public int getDklen() {
      return dklen;
    }

    public void setDklen(int dklen) {
      this.dklen = dklen;
    }

    public int getC() {
      return c;
    }

    public void setC(int c) {
      this.c = c;
    }

    public String getPrf() {
      return prf;
    }

    public void setPrf(String prf) {
      this.prf = prf;
    }

    public String getSalt() {
      return salt;
    }

    public void setSalt(String salt) {
      this.salt = salt;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) {
        return true;
      }
      if (!(o instanceof MnemonicFile.Aes128CtrKdfParams)) {
        return false;
      }

      MnemonicFile.Aes128CtrKdfParams that = (MnemonicFile.Aes128CtrKdfParams) o;

      if (dklen != that.dklen) {
        return false;
      }
      if (c != that.c) {
        return false;
      }
      if (getPrf() != null
          ? !getPrf().equals(that.getPrf())
          : that.getPrf() != null) {
        return false;
      }
      return getSalt() != null
          ? getSalt().equals(that.getSalt()) : that.getSalt() == null;
    }

    @Override
    public int hashCode() {
      int result = dklen;
      result = 31 * result + c;
      result = 31 * result + (getPrf() != null ? getPrf().hashCode() : 0);
      result = 31 * result + (getSalt() != null ? getSalt().hashCode() : 0);
      return result;
    }
  }

  public static class ScryptKdfParams implements MnemonicFile.KdfParams {
    private int dklen;
    private int n;
    private int p;
    private int r;
    private String salt;

    public ScryptKdfParams() {
    }

    public int getDklen() {
      return dklen;
    }

    public void setDklen(int dklen) {
      this.dklen = dklen;
    }

    public int getN() {
      return n;
    }

    public void setN(int n) {
      this.n = n;
    }

    public int getP() {
      return p;
    }

    public void setP(int p) {
      this.p = p;
    }

    public int getR() {
      return r;
    }

    public void setR(int r) {
      this.r = r;
    }

    public String getSalt() {
      return salt;
    }

    public void setSalt(String salt) {
      this.salt = salt;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) {
        return true;
      }
      if (!(o instanceof MnemonicFile.ScryptKdfParams)) {
        return false;
      }

      MnemonicFile.ScryptKdfParams that = (MnemonicFile.ScryptKdfParams) o;

      if (dklen != that.dklen) {
        return false;
      }
      if (n != that.n) {
        return false;
      }
      if (p != that.p) {
        return false;
      }
      if (r != that.r) {
        return false;
      }
      return getSalt() != null
          ? getSalt().equals(that.getSalt()) : that.getSalt() == null;
    }

    @Override
    public int hashCode() {
      int result = dklen;
      result = 31 * result + n;
      result = 31 * result + p;
      result = 31 * result + r;
      result = 31 * result + (getSalt() != null ? getSalt().hashCode() : 0);
      return result;
    }
  }

  static class KdfParamsDeserialiser extends JsonDeserializer<MnemonicFile.KdfParams> {

    @Override
    public MnemonicFile.KdfParams deserialize(
        JsonParser jsonParser, DeserializationContext deserializationContext)
        throws IOException {

      ObjectMapper objectMapper = (ObjectMapper) jsonParser.getCodec();
      ObjectNode root = objectMapper.readTree(jsonParser);
      MnemonicFile.KdfParams kdfParams;

      JsonNode n = root.get("n");
      if (n == null) {
        kdfParams = objectMapper.convertValue(root, MnemonicFile.Aes128CtrKdfParams.class);
      } else {
        kdfParams = objectMapper.convertValue(root, MnemonicFile.ScryptKdfParams.class);
      }

      return kdfParams;
    }
  }
}
