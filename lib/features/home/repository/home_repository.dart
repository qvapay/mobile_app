import 'package:dartz/dartz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

abstract class IHomeRepository {
  Future<Either<Failure, Me>> getUserData();
}

class HomeRepository extends IHomeRepository {
  HomeRepository({required QvaPayApi qvaPayApi}) : _qvaPayApi = qvaPayApi;

  final QvaPayApi _qvaPayApi;

  @override
  Future<Either<Failure, Me>> getUserData() async {
    try {
      final result = await _qvaPayApi.getUserData();

      return Right(result);
    } catch (e) {
      if (e is UnauthorizedException) {
        return Left(AuthenticationFailure());
      }
      return const Left(ServerFailure());
    }
  }
}
