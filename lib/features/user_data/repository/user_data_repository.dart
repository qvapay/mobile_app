import 'package:dartz/dartz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/preferences/preferences.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

abstract class IUserDataRepository {
  Future<Either<Failure, UserData>> getUserData({
    required DateTime saveDateLastLogIn,
  });
}

class UserDataRepository extends IUserDataRepository {
  UserDataRepository({
    required QvaPayApi qvaPayApi,
    required PreferencesRepository preferencesRepository,
  })  : _qvaPayApi = qvaPayApi,
        _preferencesRepository = preferencesRepository;

  final QvaPayApi _qvaPayApi;
  final PreferencesRepository _preferencesRepository;

  @override
  Future<Either<Failure, UserData>> getUserData({
    required DateTime saveDateLastLogIn,
  }) async {
    if (await _preferencesRepository.getIsFristTime()) {
      await _preferencesRepository.setIsFristTime();
    }

    try {
      final me = await _qvaPayApi.getUserData();
      final userData = UserData.fromMe(me);

      final isNotEmpty = userData.lastName.isNotEmpty;
      final name =
          '${userData.name}${isNotEmpty ? ' ' : ''}${userData.lastName}';

      await _preferencesRepository.setLastLogIn(LastLogIn(
        name: name,
        email: userData.email,
        photoUrl: userData.logo,
        date: saveDateLastLogIn,
      ));

      print(userData.latestTransactions.length);

      return Right(userData);
    } catch (e) {
      if (e is UnauthorizedException) {
        return Left(AuthenticationFailure());
      }
      return const Left(ServerFailure());
    }
  }
}
