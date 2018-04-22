#!/usr/bin/env python

import json
import itertools
import os
import re

if len(os.sys.argv) == 1:
    path = "."
    exe = "a.out"
else:
    path = os.sys.argv[1]
    exe = os.sys.argv[2]

os.chdir(path)
os.system("llvm-profdata merge --sparse -o default.profdata default.profraw")
os.system("llvm-cov export %s --summary-only -instr-profile=default.profdata > coverage.json" % exe)
os.system("llvm-cov show %s -instr-profile=default.profdata -format=html -output-dir=coverage" % exe)
os.system("llvm-cov show %s -use-color=false -instr-profile=default.profdata -format=text -output-dir=coverage" % exe)

files = (map(lambda x: os.path.join(v[0], x), v[2]) for v in
         os.walk("coverage/coverage"))
flattened = (f for items in files for f in items)
txts = (f for f in flattened if f.endswith(".txt"))

# example coverage txt: second column means hit count
"""
Coverage Report
Created: 2018-04-01 22:25
/Users/lunastorm/work/coverage/foo.cpp:
    1|       |#include "foo.h"
    2|       |
    3|       |int foo()
    4|      1|{
    5|      1|    return 78;
    6|      1|}
    7|       |
    8|       |int foo2()
    9|      0|{
   10|      0|    return 0;
   11|      0|}
"""

line_re = re.compile("^[ 0-9]+\\|[ 0-9]*\\|.*$")

for file_path in txts:
    counts_raw = (l.split("|", 2)[1].strip() for l in
                  open(file_path) if line_re.match(l))
    counts = (min(int(x), 1) if x else -1 for x in counts_raw)

    d = reduce(lambda r, c: r.setdefault(c[0], []).append(c[1])
               or r, zip(counts, itertools.count()), {})

    with open(file_path + ".json", "w") as f:
        json.dump(d, f)

with open("coverage.last", "w") as f:
    f.write("%d" % int(os.stat("default.profraw").st_mtime * 1000))