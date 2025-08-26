// Keep it plain JS, no TS types in .js files.
function analyzeNumber(x) {
    if (Number.isNaN(x)) {
        return 'not a number';
    }
    if (x < 0) {
        return 'neg';
    }
    let s = 0;
    for (let i = 0; i <= x; i++) {
        s += i;
        if (i % 5 === 0 && i > 0) {
            s += 2;
        }
    }
    if (s > 100) {
        s -= 10;
    } else {
        s += 1;
    }
    while (s > 50) {
        s -= 5;
    }
    return s;
}