import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/setting/theme/cubit/theme_cubit.dart';

import '../../../../helpers/helpers.dart';

void main() {
  group('ThemeCubit', () {
    test('initial state is correct', () {
      mockHydratedStorage(() {
        expect(ThemeCubit().state, isFalse);
      });
    });

    group('toJson/fromJson', () {
      test('work properly', () {
        mockHydratedStorage(() {
          final themeCubit = ThemeCubit();
          expect(
            themeCubit.fromJson(themeCubit.toJson(themeCubit.state)!),
            themeCubit.state,
          );
        });
      });
    });

    group('updateTheme', () {
      blocTest<ThemeCubit, bool>(
        'emits `true` when the previous statemed was `false`',
        build: () => mockHydratedStorage(() => ThemeCubit()),
        act: (cubit) => cubit.updateTheme(),
        expect: () => <bool>[true],
      );
      blocTest<ThemeCubit, bool>(
        'emits `false` when the previous statemed was `true`',
        build: () => mockHydratedStorage(() => ThemeCubit()),
        seed: () => true,
        act: (cubit) => cubit.updateTheme(),
        expect: () => <bool>[false],
      );
    });
  });
}
