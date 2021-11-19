import 'package:dartz/dartz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

abstract class ITransactionsRepository {
  Future<Either<Failure, List<UserTransaction>>> getLatestTransactions({
    String? searchTerm,
    DateTime? start,
    DateTime? end,
  });

  Future<Either<Failure, UserTransaction>> processTransaction({
    required UserTransaction transaction,
    String pin = '0000',
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

  @override
  Future<Either<Failure, UserTransaction>> processTransaction({
    required UserTransaction transaction,
    String pin = '0000',
  }) async {
    try {
      final transactionToPay = await _qvaPayApi.createTransaction(
        uuid: transaction.uuid,
        amount: transaction.amount.toDouble(),
        description: transaction.description,
      );

      final transactionPaid = await _qvaPayApi.payTransaction(
        uuid: transactionToPay.uuid,
        pin: pin,
      );

      return Right(UserTransaction.fromTransaction(transactionPaid));
    } catch (e) {
      if (e is TransactionException) {
        return Left(UserTransactionFailure(message: e.message));
      }
      if (e is PaymentException) {
        return Left(UserTransactionFailure(message: e.message));
      }
      return const Left(ServerFailure());
    }
  }
}
