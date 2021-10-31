import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:mobile_app/features/preferences/preferences.dart';
import 'package:mocktail/mocktail.dart';
import 'package:test/test.dart';

import '../../../fixtures/fixture_adapter.dart';

class MockPreferencesRepository extends Mock implements PreferencesRepository {}

void main() {
  late PreferencesRepository mockPreferencesRepository;

  final tDate = DateTime.parse('2021-12-16T00:12:00.000');

  final tLastLogInJson =
      json.decode(fixture('last_login.json')) as Map<String, dynamic>;
  final tLastLogInModel =
      LastLogIn.fromJson(tLastLogInJson).copyWith(date: tDate);

  final tGreaterThanThirtyMinutes = DateTime.fromMillisecondsSinceEpoch(
      tDate.millisecondsSinceEpoch -
          const Duration(minutes: 50).inMilliseconds);
  final tLessThanThirtyMinutes = DateTime.fromMillisecondsSinceEpoch(
      tDate.millisecondsSinceEpoch -
          const Duration(minutes: 20).inMilliseconds);

  final tGreatLastLogInModel =
      tLastLogInModel.copyWith(date: tGreaterThanThirtyMinutes);

  setUp(() {
    mockPreferencesRepository = MockPreferencesRepository();
  });

  group('GetPreferences', () {
    blocTest<PreferencesBloc, PreferencesState>(
      'emits [PreferencesFristTime] when is started the first time '
      'the app starts.',
      setUp: () {
        when(mockPreferencesRepository.getIsFristTime).thenAnswer(
          (_) async => true,
        );
      },
      build: () =>
          PreferencesBloc(preferencesRepository: mockPreferencesRepository),
      act: (bloc) => bloc.add(GetPreferences(date: tDate)),
      expect: () => <PreferencesState>[PreferencesFristTime()],
      verify: (bloc) => bloc.add(GetPreferences(date: tDate)),
    );

    blocTest<PreferencesBloc, PreferencesState>(
      'emits [PreferencesVeryRecentStart] when it starts and the session '
      'expiration time is less than [kExpireSession].',
      setUp: () {
        when(mockPreferencesRepository.getIsFristTime).thenAnswer(
          (_) async => false,
        );
        when(mockPreferencesRepository.getLastLogIn).thenAnswer(
          (_) async => tLastLogInModel.copyWith(date: tLessThanThirtyMinutes),
        );
      },
      build: () =>
          PreferencesBloc(preferencesRepository: mockPreferencesRepository),
      act: (bloc) => bloc.add(GetPreferences(date: tDate)),
      expect: () => <PreferencesState>[PreferencesVeryRecentStart()],
      verify: (bloc) => bloc.add(GetPreferences(date: tDate)),
    );

    blocTest<PreferencesBloc, PreferencesState>(
      'emits [PreferencesRecentStart] when it starts and the session '
      'expiration time is greater than [kExpireSession].',
      setUp: () {
        when(mockPreferencesRepository.getIsFristTime).thenAnswer(
          (_) async => false,
        );
        when(mockPreferencesRepository.getLastLogIn).thenAnswer(
          (_) async => tGreatLastLogInModel,
        );
      },
      build: () =>
          PreferencesBloc(preferencesRepository: mockPreferencesRepository),
      act: (bloc) => bloc.add(GetPreferences(date: tDate)),
      expect: () => <PreferencesState>[
        PreferencesRecentStart(lastLogIn: tGreatLastLogInModel)
      ],
      verify: (bloc) => bloc.add(GetPreferences(date: tDate)),
    );
    blocTest<PreferencesBloc, PreferencesState>(
      'emits [PreferencesNotRecentStart] when the return of the `getLastLogIn` '
      'method is `null`.',
      setUp: () {
        when(mockPreferencesRepository.getIsFristTime).thenAnswer(
          (_) async => false,
        );
        when(mockPreferencesRepository.getLastLogIn).thenAnswer(
          (_) async => null,
        );
      },
      build: () =>
          PreferencesBloc(preferencesRepository: mockPreferencesRepository),
      act: (bloc) => bloc.add(GetPreferences(date: tDate)),
      verify: (bloc) => bloc.add(GetPreferences(date: tDate)),
      expect: () => <PreferencesState>[PreferencesNotRecentStart()],
    );
  });

  group('CleanPreferences', () {
    blocTest<PreferencesBloc, PreferencesState>(
      'emits [PreferencesInitial] when delete data when logging out',
      setUp: () {
        when(mockPreferencesRepository.clear).thenAnswer((_) => Future.value());
        when(mockPreferencesRepository.setIsFristTime).thenAnswer(
          (_) => Future.value(),
        );
      },
      build: () =>
          PreferencesBloc(preferencesRepository: mockPreferencesRepository),
      act: (bloc) => bloc.add(CleanPreferences()),
      expect: () => <PreferencesState>[],
      verify: (bloc) {
        verify(() => mockPreferencesRepository.clear()).called(1);
        verify(() => mockPreferencesRepository.setIsFristTime()).called(1);
        bloc.add(CleanPreferences());
      },
    );
  });
}
