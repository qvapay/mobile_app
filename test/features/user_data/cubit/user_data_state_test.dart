import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class FakeUserData extends Fake implements UserData {}

void main() {
  group('UserDataState', () {
    test('supports value comparisons', () {
      expect(const UserDataState(), const UserDataState());
    });
    final tFakeUserData = FakeUserData();
    test('supports value comparisons', () {
      expect(
        UserDataState(userData: tFakeUserData),
        UserDataState(userData: tFakeUserData),
      );
    });

    test('copyWith', () {
      expect(
        const UserDataState().copyWith(),
        const UserDataState().copyWith(),
      );
    });
  });
}
