import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:mobile_app/preferences/bloc/preferences_bloc.dart';
import 'package:mobile_app/preferences/models/last_login.dart';
import 'package:mobile_app/preferences/repository/preferences_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:test/test.dart';

import '../../fixtures/fixture_adapter.dart';

class MockPreferencesRepository extends Mock implements PreferencesRepository {}

void main() {
  late PreferencesRepository mockPreferencesRepository;

  final tLastLogInJson =
      json.decode(fixture('last_login.json')) as Map<String, dynamic>;
  final tLastLogInModel =
      LastLogIn.fromJson(tLastLogInJson).copyWith(date: DateTime.now());

  final tGreaterThanThirtyMinutes = DateTime.fromMillisecondsSinceEpoch(
      DateTime.now().millisecondsSinceEpoch -
          const Duration(minutes: 50).inMilliseconds);
  final tLessThanThirtyMinutes = DateTime.fromMillisecondsSinceEpoch(
      DateTime.now().millisecondsSinceEpoch -
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
      act: (bloc) => bloc.add(GetPreferences()),
      expect: () => <PreferencesState>[PreferencesFristTime()],
      verify: (bloc) => bloc.add(GetPreferences()),
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
      act: (bloc) => bloc.add(GetPreferences()),
      expect: () => <PreferencesState>[PreferencesVeryRecentStart()],
      verify: (bloc) => bloc.add(GetPreferences()),
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
      act: (bloc) => bloc.add(GetPreferences()),
      expect: () => <PreferencesState>[
        PreferencesRecentStart(lastLogIn: tGreatLastLogInModel)
      ],
      verify: (bloc) => bloc.add(GetPreferences()),
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
      act: (bloc) => bloc.add(GetPreferences()),
      verify: (bloc) => bloc.add(GetPreferences()),
      expect: () => <PreferencesState>[PreferencesNotRecentStart()],
    );
  });
}
