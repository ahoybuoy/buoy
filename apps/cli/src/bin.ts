#!/usr/bin/env node

import { createCli } from './index.js';

const cli = createCli();
cli.parse();
