#!/usr/bin/env python

import json
import itertools
import os
import re
from functools import reduce
from io import open

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
   12|       |
   13|       |int foo3()
   14|  23.5k|{
   15|  23.5k|    return 0;
   16|  23.5k|}
"""

line_re = re.compile("^[ 0-9]+\\|[ 0-9.]*[kKmMgG]?\\|.*$")

if os.sys.version_info[0] < 3:
    write_mode = "wb"
else:
    write_mode = "w"

for file_path in txts:
    counts_raw = (l.split("|", 2)[1].strip() for l in
                  open(file_path, errors="ignore") if line_re.match(l))
    counts = (0 if x == '0' else 1 if x else -1 for x in counts_raw)

    d = reduce(lambda r, c: r.setdefault(c[0], []).append(c[1])
               or r, zip(counts, itertools.count()), {})
    if os.sys.version_info[0] < 3:
        iteritems = d.iteritems()
    else:
        iteritems = d.items()
    compressed = {k: reduce(lambda r, c: r.append([r.pop()[0], c]) or r if c == r[-1][-1] + 1 else r.append([c]) or r, v, [[-2]])[1:]
                  for (k, v) in iteritems}

    with open(file_path + ".json", write_mode) as f:
        json.dump(compressed, f)

with open("coverage.last", write_mode) as f:
    f.write("%d" % int(os.stat("default.profraw").st_mtime * 1000))
