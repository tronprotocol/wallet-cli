/*  ProtoJS - Protocol buffers for Javascript.
 *  pbj.js
 *
 *  Copyright (c) 2009-2010, Patrick Reiter Horn
 *  All rights reserved.
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are
 *  met:
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in
 *    the documentation and/or other materials provided with the
 *    distribution.
 *  * Neither the name of ProtoJS nor the names of its contributors may
 *    be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER
 * OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var PBJ = {};

/** Generates a protojs compatible vector class.
@param {boolean=} magsquared  True if this vector's elements sum to 1.
        If magsquared is set, num should be one less than the vector length. */
function vectorGenerator(num,datatype,magsquared) {
    if (!magsquared) magsquared=false;
    var ret = {
        Convert:function Convert(vec) {
            if (vec instanceof Array && vec.length==num) {
                return vec;
            } else if (vec instanceof Array && magsquared && vec.length==num+1) {
                var ret = vec.slice(0, num);
                if (vec[num] < 0) {
                    ret[0] += 3.0;
                }
                return ret;
            } else {
                console.error("Vector_in_invalid_format: "+vec+"; expect "+num+" elements.");
                return new Array(num);
            }
        },
        toString: function toString(vec) {
            var ret = '<'+vec[0];
            for (var i = 1; i < num+(magsquared?1:0); i++) {
                ret += ', '+vec[i];
            }
            ret += '>';
            return ret;
        },
        wiretype: datatype.wiretype,
        SerializeToStream: datatype.SerializeToStream,
        ParseFromStream: datatype.ParseFromStream,
        cardinality:num
    };
    if (magsquared) {
        if (num == 2) {
            ret.FromProto = function (vec) {
                var x = vec[0], y = vec[1];
                var neg=(x>1.5||y>1.5)?-1.0:1.0;
                if (x>1.5)
                    x-=3.0;
                if (y>1.5)
                    y-=3.0;
                return [x,y,neg*Math.sqrt(1-x*x-y*y)];
            };
        } else if (num == 3) {
            ret.FromProto = function (vec) {
                var x = vec[0], y = vec[1], z = vec[2];
                var neg=(x>1.5||y>1.5||z>1.5)?-1.0:1.0;
                if (x>1.5)
                    x-=3.0;
                if (y>1.5)
                    y-=3.0;
                if (z>1.5)
                    z-=3.0;
                return [x,y,z,neg*Math.sqrt(1-x*x-y*y-z*z)];
            };
        }
    }
    return ret;
};

PBJ.uint8 = PROTO.uint32
PBJ.uint16 = PROTO.uint32
PBJ.int8 = PROTO.int32
PBJ.int16 = PROTO.int32
PBJ.sint8 = PROTO.sint32
PBJ.sint16 = PROTO.sint32

PBJ.vector2d=vectorGenerator(2,PROTO.Double);
PBJ.vector2f=vectorGenerator(2,PROTO.Float);

PBJ.vector3d=vectorGenerator(3,PROTO.Double);
PBJ.vector3f=vectorGenerator(3,PROTO.Float);

PBJ.vector4d=vectorGenerator(4,PROTO.Double);
PBJ.vector4f=vectorGenerator(4,PROTO.Float);

PBJ.normal=vectorGenerator(2,PROTO.Float,true);
PBJ.quaternion=vectorGenerator(3,PROTO.Float,true);

PBJ.duration = PROTO.cloneType(PROTO.sfixed64);
PBJ.duration.Convert = function(ms) {
    if (ms instanceof PROTO.I64) {
        return ms;
    } else {
        return PROTO.I64.fromNumber(ms*1000);
    }
}
PBJ.duration.FromProto = function(ms) {
    return ms.toNumber()/1000.;
}

PBJ.time = PROTO.cloneType(PROTO.fixed64);
PBJ.time.Convert = function(date) {
    if (date instanceof Date) {
        date = date.getTime()*1000;
    } else if (date instanceof PROTO.I64) {
        return date;
    }
    return PROTO.I64.fromNumber(date*1000);
};
// Can fit us since 1970 into a double, with 2 extra bits of precision.
PBJ.time.toString = function(arg) {
    var ms1970,us;
    if (arg instanceof PROTO.I64) {
        var us1970 = arg.toNumber();
        ms1970 = Math.floor(us1970/1000);
        var sec1970 = Math.floor(us1970/1000000);
        us = arg.sub(PROTO.I64.fromNumber(sec1970*1000000)).toNumber();
    } else {
        ms1970 = arg;
        var us1970 = arg*1000;
        var sec1970 = Math.floor(ms1970/1000);
        us = us1970 - (sec1970*1000000);
    }
    if (us < 0) { us += 1000000; }
    return "[" + new Date(ms1970).toUTCString() + "]." +
        (1000000+us).toString().substr(1);
};
PBJ.time.FromProto = function(i64) {
    return i64.toNumber()/1000.;
};
(function () {

    var zero = '0'.charCodeAt(0);
    var a = 'a'.charCodeAt(0);
    var A = 'A'.charCodeAt(0);
    var dash = '-'.charCodeAt(0);

    function hexCharToNumber(c) {
        if (c >= zero && c < zero+10) {
            return (c - zero);
        } else if (c >= a && c < a+6) {
            return 10+(c - a);
        } else if (c >= A && c < A+6) {
            return 10+(c - A);
        }
        return 0;
    }

    function hexToArray(str, arrlen) {
        var ret = new Array(arrlen);
        var strlen = str.length;
        for (var i = 0, j = 0; i < strlen || j < arrlen; i+=2, j++) {
            var charcode2, charcode = str.charCodeAt(i);
            if (charcode == dash) {
                i++;
                charcode = str.charCodeAt(i);
            }
            charcode2 = str.charCodeAt(i+1);
            ret[j] = hexCharToNumber(charcode)*16 + hexCharToNumber(charcode2);
        }
        return ret;
    }

    PBJ.sha256 = PROTO.cloneType(PROTO.bytes);
    PBJ.sha256.Convert = function(arg) {
        if (arg instanceof Array) {
            return PROTO.bytes.Convert(arg);
        }
        return hexToArray(arg, 32);
    };
    PBJ.sha256.toString = function(arg) {
        if (typeof arg == "string") {
            return arg;
        }
        var str = '';
        for (var i = 0; i < arg.length && i < 32; i++) {
            str += (256+arg[i]).toString(16).substr(1);
        }
        while (str.length < 64) {
            str += '0';
        }
        return str;
    };
    PBJ.sha256.FromProto = PBJ.sha256.toString;

    PBJ.uuid = PROTO.cloneType(PROTO.bytes);
    PBJ.uuid.Convert = function(arg) {
        if (arg instanceof Array) {
            return PROTO.bytes.Convert(arg);
        }
        return hexToArray(arg, 16);
    };
    PBJ.uuid.toString = function(arg) {
        if (typeof arg == "string") {
            return arg;
        }
        var str = '';
        for (var i = 0; i < 16; i++) {
            if (i == 4 || i == 6 || i == 8 || i == 10) {
                str += '-'
            }
            if (i >= arg.length) {
                str += "00";
            } else {
                str += (256+arg[i]).toString(16).substr(1);
            }
        }
        return str;
    };
    PBJ.uuid.FromProto = PBJ.uuid.toString;
})();

PBJ.angle = PROTO.Float;

PBJ.boundingsphere3f=vectorGenerator(4,PROTO.Float);
PBJ.boundingsphere3d=vectorGenerator(4,PROTO.Double);
PBJ.boundingbox3f3f=vectorGenerator(6,PROTO.Float);
PBJ.boundingbox3d3f=vectorGenerator(6,PROTO.Double);
