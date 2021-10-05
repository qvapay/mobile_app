import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile_app/preferences/models/last_login.dart';
import 'package:mobile_app/preferences/repository/preferences_repository.dart';
import 'package:mocktail/mocktail.dart';

class MockBox extends Mock implements Box<Map<String, dynamic>> {}

void main() {
  late PreferencesRepository preferencesRepository;
  late MockBox mockBox;

  const mockIsFristTimeCero = <String, int>{keyIsFristTime: 0};
  const mockIsFristTimeOne = <String, int>{keyIsFristTime: 1};
  const mockEmptyMap = <String, dynamic>{};

  final mockLastLogIn = <String, Map<String, String>>{
    keyLastLogIn: <String, String>{
      'name': 'QvaPay App',
      'email': 'test@qvapay.com',
      'photoUrl': 'https://qvapay.com/icon.png',
      'date': '2021-10-04T00:00:00.000'
    },
  };

  setUp(() {
    mockBox = MockBox();
    preferencesRepository = HivePreferencesRepository(preferencesBox: mockBox);
  });

  group('getIsFristTime', () {
    test('return `true` if is a first time.', () async {
      when(() => mockBox.get(keyIsFristTime, defaultValue: mockIsFristTimeCero))
          .thenReturn(mockIsFristTimeCero);

      final isFristTime = await preferencesRepository.getIsFristTime();

      expect(isFristTime, isTrue);
    });

    test('return `false` if is not a first time.', () async {
      when(() => mockBox.get(keyIsFristTime, defaultValue: mockIsFristTimeCero))
          .thenReturn(mockIsFristTimeOne);

      final isFristTime = await preferencesRepository.getIsFristTime();

      expect(isFristTime, isFalse);
    });
  });

  group('setIsFristTime', () {
    test('change to 1 the value save in the `Box`.', () {
      when(() => mockBox.put(keyIsFristTime, mockIsFristTimeOne))
          .thenAnswer((_) async => Future.value());

      expect(preferencesRepository.setIsFristTime(), completes);
    });
  });

  group('getLastLogIn', () {
    test('return a `null` when is not save any value.', () async {
      when(() => mockBox.get(keyLastLogIn, defaultValue: mockEmptyMap))
          .thenReturn(mockEmptyMap);

      final lastLogIn = await preferencesRepository.getLastLogIn();

      expect(lastLogIn, isNull);
    });

    test('return a `LastLogIn` with the last `LogIn` values.', () async {
      when(() => mockBox.get(keyLastLogIn, defaultValue: mockEmptyMap))
          .thenReturn(mockLastLogIn);

      final lastLogIn = await preferencesRepository.getLastLogIn();

      expect(
          lastLogIn, equals(LastLogIn.fromJson(mockLastLogIn[keyLastLogIn]!)));
    });
  });

  group('setLastLogIn', () {
    test('save the last `LogIn` values.', () {
      when(() => mockBox.put(keyLastLogIn, mockLastLogIn))
          .thenAnswer((_) async => Future.value());

      expect(
        preferencesRepository
            .setLastLogIn(LastLogIn.fromJson(mockLastLogIn[keyLastLogIn]!)),
        completes,
      );
    });
  });

  group('clean', () {
    test('delete all value on the `Box`', () {
      when(() => mockBox.clear()).thenAnswer((_) async => 1);

      expect(
        preferencesRepository.clear(),
        completes,
      );
    });
  });
}
