part of 'recover_password_bloc.dart';

abstract class RecoverPasswordState extends Equatable {
  const RecoverPasswordState();
  
  @override
  List<Object> get props => [];
}

class RecoverPasswordInitial extends RecoverPasswordState {}
