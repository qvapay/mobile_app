import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/user_data/user_data.dart';
import 'package:mocktail/mocktail.dart';

import '../../../constants.dart';
import '../../../fixtures/fixture_adapter.dart';
import '../../../helpers/hydrated_bloc.dart';

class MockUserDataRepository extends Mock implements IUserDataRepository {}

void main() {
  initHydratedBloc();

  late IUserDataRepository userDataRepository;
  late UserDataCubit userDataCubit;

  setUp(() {
    userDataRepository = MockUserDataRepository();
    userDataCubit = UserDataCubit(userDataRepository: userDataRepository);
  });

  final tUserDataJson =
      json.decode(fixture('user_data.json')) as Map<String, dynamic>;
  final tUserDataModel = UserData.fromJson(tUserDataJson);

  test('initial state', () {
    expect(userDataCubit.state, const UserDataState());
  });

  group('fromJson', () {
    test('shuld return [UserDataState] with UserData', () {
      expect(
        userDataCubit.fromJson(tUserDataJson),
        equals(UserDataState(userData: tUserDataModel)),
      );
    });

    test('should return `errorMessage` when is empty', () {
      expect(
        userDataCubit.fromJson(<String, dynamic>{}),
        equals(const UserDataState(errorMessage: 'Empty Cache')),
      );
    });
  });

  group('toJson', () {
    test('shuld return UserData in json', () {
      expect(
        userDataCubit.toJson(UserDataState(userData: tUserDataModel)),
        equals(tUserDataJson),
      );
    });

    test('should return empty [Map] when `userData` is null', () {
      expect(
        userDataCubit.toJson(const UserDataState()),
        equals(<String, dynamic>{}),
      );
    });
  });

  group('UserDataState', () {
    blocTest<UserDataCubit, UserDataState>(
      'emit [UserData] when `getUserData` is call',
      setUp: () {
        when(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .thenAnswer((_) async => Right(tUserDataModel));
      },
      build: () => UserDataCubit(userDataRepository: userDataRepository),
      act: (cubit) => cubit.getUserData(saveDateLastLogIn: tDate),
      expect: () {
        return <UserDataState>[
          const UserDataState(errorMessage: '*'),
          UserDataState(
            userData: tUserDataModel,
            isStateLoading: false,
            errorMessage: '*',
          ),
        ];
      },
    );

    blocTest<UserDataCubit, UserDataState>(
      'emit [errorMessage] when `getUserData` return [ServerFailure]',
      setUp: () {
        when(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .thenAnswer((_) async => const Left(ServerFailure()));
      },
      build: () => UserDataCubit(userDataRepository: userDataRepository),
      act: (cubit) => cubit.getUserData(saveDateLastLogIn: tDate),
      verify: (cubit) {
        verify(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .called(1);
      },
      expect: () {
        return <UserDataState>[
          const UserDataState(errorMessage: '*'),
          const UserDataState(
            errorMessage: 'Server Failure',
            isStateLoading: false,
          ),
        ];
      },
    );

    blocTest<UserDataCubit, UserDataState>(
      'emit [errorMessage] when `getUserData` return [AuthenticationFailure]',
      setUp: () {
        when(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .thenAnswer((_) async => const Left(AuthenticationFailure()));
      },
      build: () => UserDataCubit(userDataRepository: userDataRepository),
      act: (cubit) => cubit.getUserData(saveDateLastLogIn: tDate),
      verify: (cubit) {
        verify(() => userDataRepository.getUserData(saveDateLastLogIn: tDate))
            .called(1);
      },
      expect: () => <UserDataState>[
        const UserDataState(errorMessage: '*'),
        const UserDataState(
          errorMessage: 'Authentication Failure',
          isStateLoading: false,
        )
      ],
    );
  });
}
