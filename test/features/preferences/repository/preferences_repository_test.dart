import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile_app/features/preferences/preferences.dart';
import 'package:mocktail/mocktail.dart';

class MockBox extends Mock implements Box<Map> {}

void main() {
  late PreferencesRepository preferencesRepository;
  late MockBox mockBox;

  const mockIsFristTimeFalse = <dynamic, dynamic>{keyIsFristTime: false};
  const mockEmptyMap = <String, dynamic>{};

  final mockLastLogIn = <dynamic, dynamic>{
    keyLastLogIn: <dynamic, dynamic>{
      'name': 'QvaPay App',
      'email': 'test@qvapay.com',
      'photoUrl': 'https://qvapay.com/icon.png',
      'date': '2021-10-04T00:00:00.000'
    },
  };

  final tCastLastLogIn = (mockLastLogIn.cast<String, Map>())[keyLastLogIn]!
      .cast<String, dynamic>();

  setUp(() {
    mockBox = MockBox();
    preferencesRepository = HivePreferencesRepository(preferencesBox: mockBox);
  });

  group('getIsFristTime', () {
    test('return `true` if it is the first time.', () async {
      when(() => mockBox.containsKey(keyIsFristTime)).thenReturn(false);

      final isFristTime = await preferencesRepository.getIsFristTime();

      expect(isFristTime, isTrue);
    });

    test('return `false` if is not the first time.', () async {
      when(() => mockBox.containsKey(keyIsFristTime)).thenReturn(true);
      when(() => mockBox.get(keyIsFristTime, defaultValue: defValIsFristTime))
          .thenReturn(mockIsFristTimeFalse);

      final isFristTime = await preferencesRepository.getIsFristTime();

      expect(isFristTime, isFalse);
    });

    test('return the `defaultValue`.', () async {
      when(() => mockBox.containsKey(keyIsFristTime)).thenReturn(true);
      when(() => mockBox.get(keyIsFristTime, defaultValue: defValIsFristTime))
          .thenReturn(null);

      final isFristTime = await preferencesRepository.getIsFristTime();

      expect(isFristTime, isTrue);
    });
  });

  group('setIsFristTime', () {
    test('change to `false` the value save in the `Box`.', () {
      when(() => mockBox.put(keyIsFristTime, mockIsFristTimeFalse))
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

      expect(lastLogIn, equals(LastLogIn.fromJson(tCastLastLogIn)));
    });
  });

  group('setLastLogIn', () {
    test('save the last `LogIn` values.', () {
      when(() => mockBox.put(keyLastLogIn, mockLastLogIn))
          .thenAnswer((_) async => Future.value());

      expect(
        preferencesRepository.setLastLogIn(LastLogIn.fromJson(tCastLastLogIn)),
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
