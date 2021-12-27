package org.tron.common.utils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.protobuf.InvalidProtocolBufferException;
import junit.framework.TestCase;
import org.tron.protos.Protocol;

public class TransactionUtilsTest extends TestCase {

    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    public void testSignTransactionOffline() throws InvalidProtocolBufferException {
        String privateKey = "e0fbcf8cd2a1f0f5f24784be223f4ef92b085984de6a2c4280ff772ffea43181";
        String bytes = "CtMBCgIhFyIIIOAcIu7oSjxAkLfU9NUvWq4BCB8SqQEKMXR5cGUuZ29vZ2xlYXBpcy5jb20vcHJvdG9jb2wuVHJpZ2dlclNtYXJ0Q29udHJhY3QSdAoVQV8qcs7a1sQ3JwwLgOaSGXwkSKf5EhVB6lE0Lau7korh5Xa9Oe/4qvBwqMYiRKkFnLsAAAAAAAAAAAAAAEE4wmUJs63kedV3aq6y67Le45FWcgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGrPwAcNOqv+PVL5ABgK3iBA==";
        Protocol.Transaction transaction = Protocol.Transaction.parseFrom(objectMapper.convertValue(bytes, byte[].class));
        try {
            TransactionUtils.signTransactionOffline(transaction, privateKey);
            assert true;
        } catch (Exception exc) {
            System.err.println("Got unexpected exception " + exc);
        }
    }
}