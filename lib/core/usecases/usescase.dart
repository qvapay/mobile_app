import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile_app/core/error/failures.dart';

/// Base class for declaring Usecases.
abstract class UseCase<Type, Params> {
  Future<Either<Failure, Type>> call(Params params);
}

/// Class for passing NoParams to Usecases
class NoParams extends Equatable {
  @override
  List<Object> get props => [];
}
