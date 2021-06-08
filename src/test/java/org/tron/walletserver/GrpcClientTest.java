package org.tron.walletserver;

import org.junit.Assert;
import org.junit.Ignore;
import org.junit.Test;
import org.tron.protos.Protocol;

public class GrpcClientTest {

    private final GrpcClient client = new GrpcClient("3.225.171.164:50051", null, false);

    @Test
    @Ignore
    public void testCreateRawTrc20Transaction() {
        String contractAddress = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
        Protocol.Transaction rawTrc20Transaction = client.createRawTrc20Transaction(
                "TLrEGwHV78cp1vYU42j8r5HNKxpmKwPQD9",
                "TW9E8eWpFgJoEX5F9WsvbQC1vptjsExnQG",
                "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
                4000L * client.getPrecision("TLrEGwHV78cp1vYU42j8r5HNKxpmKwPQD9", contractAddress),
                null
        );
        System.out.println(rawTrc20Transaction);
    }

    @Test
    public void testGetPrecision() {
        int precision = client.getPrecision("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
        Assert.assertEquals(6, precision);

        precision = client.getPrecision("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX", "TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT");
        Assert.assertEquals(18, precision);

        precision = client.getPrecision("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX", "THAS6i5Kqw64VyeREmpo5XRQuGqrBuJcV3");
        Assert.assertEquals(18, precision);

        precision = client.getPrecision("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX", "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR");
        Assert.assertEquals(6, precision);

        precision = client.getPrecision("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX", "TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt");
        Assert.assertEquals(6, precision);

        precision = client.getPrecision("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX", "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9");
        Assert.assertEquals(8, precision);

        precision = client.getPrecision("TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX", "TF3N6yDLfhosmx4LEqiq7pLcUWxdYMMfWV");
        Assert.assertEquals(8, precision);
    }
}