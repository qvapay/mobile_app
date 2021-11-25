// Copyright (c) 2021, Very Good Ventures
// https://verygood.ventures
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import 'package:device_preview/device_preview.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile_app/app/app.dart';
import 'package:mobile_app/bootstrap.dart';

void main() {
  bootstrap(
    () => DevicePreview(
      enabled: !kReleaseMode,
      builder: (context) => const App(),
    ),
  );
}
