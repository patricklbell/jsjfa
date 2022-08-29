function get_window_size() {
    var docEl = document.documentElement,
    IS_BODY_ACTING_ROOT = docEl && docEl.clientHeight === 0;

    // Used to feature test Opera returning wrong values 
    // for documentElement.clientHeight. 
    function isDocumentElementHeightOff () { 
        var d = document,
            div = d.createElement('div');
        div.style.height = "2500px";
        d.body.insertBefore(div, d.body.firstChild);
        var r = d.documentElement.clientHeight > 2400;
        d.body.removeChild(div);
        return r;
    }

    if (typeof document.clientWidth == "number") {
        return { width: document.clientWidth, height: document.clientHeight };
    } else if (IS_BODY_ACTING_ROOT || isDocumentElementHeightOff()) {
        var b = document.body;
        return { width: b.clientWidth, height: b.clientHeight };
    } else {
        return { width: docEl.clientWidth, height: docEl.clientHeight };
    };
};

class vec2 {
    constructor(x, y) {
        if(x === undefined) {
            this.x = 0;
            this.y = 0;
        } else if(y === undefined) {
            this.x = x;
            this.y = x;
        } else {
            this.x = x;
            this.y = y;
        }
    }
    add(v) {
        return new vec2(this.x+v.x, this.y+v.y);
    }
    subtract(v) {
        return new vec2(this.x-v.x, this.y-v.y);
    }
    multiply(v) {
        return new vec2(this.x*v.x, this.y*v.y);
    }
    divide(v) {
        return new vec2(this.x/v.x, this.y/v.y);
    }

    scalar_add(x) {
        return new vec2(this.x+x, this.y+x);
    }
    scalar_subtract(x) {
        return new vec2(this.x-x, this.y-x);
    }
    scalar_multiply(x) {
        return new vec2(this.x*x, this.y*x);
    }
    scalar_divide(x) {
        return new vec2(this.x/x, this.y/x);
    }

    dot(v) {
        return this.x*v.x + this.y*v.y;
    }
    length() {
        return Math.sqrt(this.x*this.x + this.y*this.y);
    }
    normalize() {
        return this.scalar_divide(this.length());
    }

    toString() {
        return "x: " + this.x.toString() + " y: " + this.y.toString();
    }
}

class vec3 {
    constructor(x, y, z) {
        if(x === undefined) {
            this.x = 0;
            this.y = 0;
            this.z = 0;
        } else if(y === undefined) {
            this.x = x;
            this.y = x;
            this.z = x;
        } else if(z === undefined) {
            throw 'vec3 needs 0, 1 or 3 parameters';
        } else {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }
    add(v) {
        return new vec2(this.x+v.x, this.y+v.y, this.z+v.z);
    }
    subtract(v) {
        return new vec2(this.x-v.x, this.y-v.y, this.z-v.z);
    }
    multiply(v) {
        return new vec2(this.x*v.x, this.y*v.y, this.z*v.z);
    }
    divide(v) {
        return new vec2(this.x/v.x, this.y/v.y, this.z/v.z);
    }

    scalar_add(x) {
        return new vec2(this.x+x, this.y+x, this.z+x);
    }
    scalar_subtract(x) {
        return new vec2(this.x-x, this.y-x, this.z-x);
    }
    scalar_multiply(x) {
        return new vec2(this.x*x, this.y*x, this.z*x);
    }
    scalar_divide(x) {
        return new vec2(this.x/x, this.y/x, this.z/x);
    }

    dot(v) {
        return this.x*v.x + this.y*v.y + this.z*v.z;
    }
    cross(v) {
        return new vec3(this.y*v.z - this.z*v.y,
                        this.z*v.x - this.a*v.z,
                        this.x*v.y - this.y*v.x);
    }
    length() {
        return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
    }
    normalize() {
        return this.scalar_divide(this.length());
    }

    toString() {
        return "x: " + this.x.toString() + " y: " + this.y.toString() + " z: " + this.z.toString();
    }
}
