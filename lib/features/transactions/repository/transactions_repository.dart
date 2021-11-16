import 'package:dartz/dartz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

abstract class ITransactionsRepository {
  Future<Either<Failure, List<UserTransaction>>> getLatestTransactions({
    String? searchTerm,
    DateTime? start,
    DateTime? end,
  });
}

class TransactionsRepository extends ITransactionsRepository {
  TransactionsRepository({required QvaPayApi qvaPayApi})
      : _qvaPayApi = qvaPayApi;

  final QvaPayApi _qvaPayApi;

  @override
  Future<Either<Failure, List<UserTransaction>>> getLatestTransactions({
    String? searchTerm,
    DateTime? start,
    DateTime? end,
  }) async {
    try {
      final transactions = await _qvaPayApi.getTransactions(
        description: searchTerm,
        start: start,
        end: end,
      );

      final userTransactions =
          transactions.map((t) => UserTransaction.fromTransaction(t)).toList();

      return Right(userTransactions);
    } catch (e) {
      return const Left(ServerFailure());
    }
  }
}
