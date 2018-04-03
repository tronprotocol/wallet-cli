/* keccak.js
 * A Javascript implementation of the Keccak SHA-3 candidate from Bertoni,
 * Daemen, Peeters and van Assche. This version is not optimized with any of
 * the tricks specifically mentioned in the spec, and was intended as a first
 * implementation to help in understanding the specification. It uses a long
 * integer class L to handle double arithmetic; the class is stateful so that
 * constructors don't slow down the algorithm.
 *
 * This file implements Keccak[1088, 512, 32], their proposed candidate for
 * SHA3-256. This implementation operates on Javascript strings, interpreted as
 * UTF-16LE encoded (i.e. "\u1234\u5678" --> [0x34, 0x12, 0x78, 0x56], and thus
 * is restricted to hash byte strings which are a multiple of 2 bytes in
 * length.
 *
 * The following test vectors are given on the Keccak NIST CD:
 *     ShortMsgKAT_256.txt
 *         Len = 0
 *         Msg = 00
 *         MD = C5D2460186F7233C927E7DB2DCC703C0E500B653CA82273B7BFAD8045D85A470
 *         ...
 *         Len = 16
 *         Msg = 41FB
 *         MD = A8EACEDA4D47B3281A795AD9E1EA2122B407BAF9AABCB9E18B5717B7873537D2
 *         ...
 *         Len = 2000
 *         Msg = B3C5E74B69933C2533106C563B4CA20238F2B6E675E8681E34A389894785BDADE59652D4A73D80A5C85BD454FD1E9FFDAD1C3815F5038E9EF432AAC5C3C4FE840CC370CF86580A6011778BBEDAF511A51B56D1A2EB68394AA299E26DA9ADA6A2F39B9FAFF7FBA457689B9C1A577B2A1E505FDF75C7A0A64B1DF81B3A356001BF0DF4E02A1FC59F651C9D585EC6224BB279C6BEBA2966E8882D68376081B987468E7AED1EF90EBD090AE825795CDCA1B4F09A979C8DFC21A48D8A53CDBB26C4DB547FC06EFE2F9850EDD2685A4661CB4911F165D4B63EF25B87D0A96D3DFF6AB0758999AAD214D07BD4F133A6734FDE445FE474711B69A98F7E2B
 *         MD = C6D86CC4CCEF3BB70BF7BFDDEC6A9A04A0DD0A68FE1BF51C14648CF506A03E98
 *
 * The corresponding Javascript code is:
 *     keccak("");
 *         "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
 *     keccak("\ufb41");
 *         "a8eaceda4d47b3281a795ad9e1ea2122b407baf9aabcb9e18b5717b7873537d2"
 *     keccak("\uC5B3\u4BE7\u9369\u253C\u1033\u566C\u4C3B\u02A2\uF238\uE6B6\uE875\u1E68\uA334\u8989\u8547\uADBD\u96E5\uD452\u3DA7\uA580\u5BC8\u54D4\u1EFD\uFD9F\u1CAD\u1538\u03F5\u9E8E\u32F4\uC5AA\uC4C3\u84FE\uC30C\uCF70\u5886\u600A\u7711\uBE8B\uF5DA\uA511\u561B\uA2D1\u68EB\u4A39\u99A2\u6DE2\uADA9\uA2A6\u9BF3\uAF9F\uFBF7\u57A4\u9B68\u1A9C\u7B57\u1E2A\u5F50\u75DF\uA0C7\u4BA6\uF81D\u3A1B\u6035\uBF01\uF40D\u2AE0\uC51F\u659F\u9D1C\u5E58\u22C6\uB24B\uC679\uBABE\u6629\u88E8\u682D\u6037\uB981\u4687\u7A8E\u1EED\u0EF9\u09BD\uE80A\u7925\uDC5C\uB4A1\u9AF0\u9C97\uFC8D\uA421\u8A8D\uCD53\u26BB\uDBC4\u7F54\u6EC0\u2FFE\u5098\uD2ED\u5A68\u6146\u49CB\uF111\uD465\u3EB6\u5BF2\uD087\u6DA9\uFF3D\uB06A\u8975\uAA99\u14D2\u7BD0\uF1D4\uA633\u4F73\u44DE\uE45F\u7174\u691B\u8FA9\u2B7E");
 *         "c6d86cc4ccef3bb70bf7bfddec6a9a04a0dd0a68fe1bf51c14648cf506a03e98"
 *
 * This function was written by Chris Drost of drostie.org, and he hereby
 * dedicates it into the public domain: it has no copyright. It is provided with
 * NO WARRANTIES OF ANY KIND. I do humbly request that you provide me some sort
 * of credit if you use it; but I leave that choice up to you.
 */

/*jslint white: true, onevar: true, undef: true, nomen: true, eqeqeq: true, plusplus: true, regexp: true, newcap: true, immed: true, strict: true, maxerr: 50, indent: 4 */
"use strict";
var keccak = (function () {
    var state, State, L, permute, zeros, RC, r, keccak_f;
    L = function (lo, hi) {
        this.lo = lo ? lo : 0;
        this.hi = hi ? hi : 0;
    };
    L.clone = function (a) {
        return new L(a.lo, a.hi);
    };
    L.prototype = {
        xor: function (that) {
            this.lo ^= that.lo;
            this.hi ^= that.hi;
            return this;
        },
        not: function () {
            return new L(~this.lo, ~this.hi);
        },
        and: function (that) {
            this.lo &= that.lo;
            this.hi &= that.hi;
            return this;
        },
        circ: function (n) {
            var tmp, m;
            if (n >= 32) {
                tmp = this.lo;
                this.lo = this.hi;
                this.hi = tmp;
                n -= 32;
            }
            if (n === 0) {
                return this;
            }
            m = 32 - n;
            tmp = (this.hi << n) + (this.lo >>> m);
            this.lo = (this.lo << n) + (this.hi >>> m);
            this.hi = tmp;
            return this;
        },
        toString: (function () {
            var hex, o;
            hex = function (n) {
                return ("00" + n.toString(16)).slice(-2);
            };
            o = function (n) {
                return hex(n & 255) + hex(n >>> 8) + hex(n >>> 16) + hex(n >>> 24);
            };
            return function () {
                return o(this.lo) + o(this.hi);
            };
        }())
    };
    zeros = function (k) {
        var i, z = [];
        for (i = 0; i < k; i += 1) {
            z[i] = new L();
        }
        return z;
    };
    State = function (s) {
        var fn = function (x, y) {
            return fn.array[(x % 5) + 5 * (y % 5)];
        };
        fn.array = s ? s : zeros(25);
        fn.clone = function () {
            return new State(fn.array.map(L.clone));
        };
        return fn;
    };

    permute = [0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14, 24, 9, 19, 4];
    RC = "0,1;0,8082;z,808A;z,yy;0,808B;0,y0001;z,y8081;z,8009;0,8A;0,88;0,y8009;0,y000A;0,y808B;z,8B;z,8089;z,8003;z,8002;z,80;0,800A;z,y000A;z,y8081;z,8080;0,y0001;z,y8008"
        .replace(/z/g, "80000000").replace(/y/g, "8000").split(";").map(function (str) {
            var k = str.split(",");
            return new L(parseInt(k[1], 16), parseInt(k[0], 16));
        });
    r = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
    keccak_f = function () {
        var x, y, i, b, C, D, round, last;
        for (round = 0; round < 24; round += 1) {
            // THETA STEP
            C = zeros(5);
            for (x = 0; x < 5; x += 1) {
                for (y = 0; y < 5; y += 1) {
                    C[x].xor(state(x, y));
                }
            }
            // Extra logic needed because L() objects are dynamic.
            // D[x] = C[x + 1]
            D = C.map(L.clone);
            D = D.concat(D.splice(0, 1));
            // D[x] = C[x - 1] xor rot(C[x+1], 1)
            for (x = 0; x < 5; x += 1) {
                D[x].circ(1).xor(C[(x + 4) % 5]);
            }
            for (x = 0; x < 5; x += 1) {
                for (y = 0; y < 5; y += 1) {
                    state(x, y).xor(D[x]);
                }
            }
            // RHO STEP
            for (x = 0; x < 5; x += 1) {
                for (y = 0; y < 5; y += 1) {
                    state(x, y).circ(r[5 * y + x]);
                }
            }
            // PI STEP
            last = state.array.slice(0);
            for (i = 0; i < 25; i += 1) {
                state.array[permute[i]] = last[i];
            }

            // CHI STEP
            b = state.clone();
            for (x = 0; x < 5; x += 1) {
                for (y = 0; y < 5; y += 1) {
                    state(x, y).xor(b(x + 1, y).not().and(b(x + 2, y)));
                }
            }
            // IOTA STEP
            state(0, 0).xor(RC[round]);
        }
    };
    return function (m) {
        state = new State();
        if (m.length % 68 === 67) {
            m+="\u8001";
        } else {
            m += "\x01";
            while (m.length % 68 !== 67) {
                m += "\0";
            }
            m+="\u8000";
        }
        var b, k;
        for (b = 0; b < m.length; b += 68) {
            for (k = 0; k < 68; k += 4) {
                state.array[k / 4].xor(
                    new L(m.charCodeAt(b + k) + m.charCodeAt(b + k + 1) * 65536,
                        m.charCodeAt(b + k + 2) +  m.charCodeAt(b + k + 3) * 65536)
                );
            }
            keccak_f();
        }
        return state.array.slice(0, 4).join("");
    };
}());