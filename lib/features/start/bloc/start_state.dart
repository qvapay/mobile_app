part of 'start_bloc.dart';

abstract class StartState extends Equatable {
  const StartState();
  
  @override
  List<Object> get props => [];
}

class StartInitial extends StartState {}
