#!/usr/bin/env node

import { fixScript } from './fix';
import { helpScript } from './help';
import { initScript } from './init';
import { newScript } from './new';

if (process.argv.length < 3 || process.argv[2] === 'help') {
  helpScript();
} else if (process.argv[2] === 'version') {
  console.info('@wemakefuture/y 0.3.0');
} else if (process.argv[2] === 'init') {
  initScript();
} else if (process.argv[2] === 'fix') {
  fixScript();
} else if (process.argv[2] === 'new') {
  newScript();
} else {
  console.error(`error: invalid command '${process.argv[2]}'`);
  process.exit(1);
}
