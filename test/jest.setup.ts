import { Logger } from '@nestjs/common';

// Silence Nest's logger during unit tests. Specs that need to inspect log
// output can override individual methods with `jest.spyOn`.
Logger.overrideLogger(false);
